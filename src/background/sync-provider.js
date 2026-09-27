function base64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function buildBasePath(pathPrefix, meeting) {
  var dateFolder = new Date(meeting.startedAt).toISOString().slice(0, 10);
  var safeTitle = meeting.title
    .replace(/[^\u0600-\u06FFa-zA-Z0-9-]/g, "")
    .slice(0, 60);
  return pathPrefix + dateFolder + "-" + safeTitle + "-" + meeting.id + "/";
}

/**
 * GitHub Contents API.
 * see https://docs.github.com/en/rest/repos/contents
 */
export class GitHubSyncClient {
  constructor(config) {
    this.token = config.token;
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch || "main";
    this.pathPrefix = config.pathPrefix || "meetings/";
  }

  get headers() {
    return {
      Authorization: "Bearer " + this.token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  get apiBase() {
    return (
      "https://api.github.com/repos/" +
      this.owner +
      "/" +
      this.repo +
      "/contents/"
    );
  }

  async getExistingSha(path) {
    var res = await fetch(this.apiBase + path + "?ref=" + this.branch, {
      headers: this.headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("GitHub read error " + res.status);
    var json = await res.json();
    return json.sha;
  }

  async putFile(path, contentUtf8, message) {
    var sha = await this.getExistingSha(path);
    var body = {
      message: message,
      content: base64EncodeUtf8(contentUtf8),
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    var res = await fetch(this.apiBase + path, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(
        "GitHub write error " + res.status + " " + (await res.text()),
      );
    return res.json();
  }

  async syncMeeting(meeting, markdownContent) {
    var basePath = buildBasePath(this.pathPrefix, meeting);
    await this.putFile(
      basePath + "report.md",
      markdownContent,
      "sync report: " + meeting.title,
    );
    await this.putFile(
      basePath + "transcript.txt",
      meeting.plainTranscript,
      "sync transcript: " + meeting.title,
    );
    await this.putFile(
      basePath + "meeting.json",
      JSON.stringify(meeting, null, 2),
      "sync raw data: " + meeting.title,
    );
  }
}

/**
 * GitLab Repository Files API. Works against gitlab.com or any self-hosted
 * instance when baseUrl (e.g. https://gitlab.mycompany.com) is set.
 * see https://docs.gitlab.com/api/repository_files/
 */
export class GitLabSyncClient {
  constructor(config) {
    this.token = config.token;
    // GitLab identifies a project by its full namespace path, e.g.
    // "group/subgroup/project". owner+repo are joined here so users can
    // fill them in the same two fields as GitHub.
    this.projectPath =
      config.repo.indexOf("/") !== -1
        ? config.repo
        : config.owner + "/" + config.repo;
    this.branch = config.branch || "main";
    this.pathPrefix = config.pathPrefix || "meetings/";
    this.apiBase =
      (config.baseUrl || "https://gitlab.com").replace(/\/$/, "") + "/api/v4/";
  }

  get headers() {
    return { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" };
  }

  get encodedProjectId() {
    return encodeURIComponent(this.projectPath);
  }

  async fileExists(path) {
    var url =
      this.apiBase +
      "projects/" +
      this.encodedProjectId +
      "/repository/files/" +
      encodeURIComponent(path) +
      "?ref=" +
      this.branch;
    var res = await fetch(url, { headers: this.headers });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error("GitLab read error " + res.status);
    return true;
  }

  async putFile(path, contentUtf8, message) {
    var exists = await this.fileExists(path);
    var url =
      this.apiBase +
      "projects/" +
      this.encodedProjectId +
      "/repository/files/" +
      encodeURIComponent(path);
    var res = await fetch(url, {
      method: exists ? "PUT" : "POST",
      headers: this.headers,
      body: JSON.stringify({
        branch: this.branch,
        content: contentUtf8,
        commit_message: message,
      }),
    });
    if (!res.ok)
      throw new Error(
        "GitLab write error " + res.status + " " + (await res.text()),
      );
    return res.json();
  }

  async syncMeeting(meeting, markdownContent) {
    var basePath = buildBasePath(this.pathPrefix, meeting);
    await this.putFile(
      basePath + "report.md",
      markdownContent,
      "sync report: " + meeting.title,
    );
    await this.putFile(
      basePath + "transcript.txt",
      meeting.plainTranscript,
      "sync transcript: " + meeting.title,
    );
    await this.putFile(
      basePath + "meeting.json",
      JSON.stringify(meeting, null, 2),
      "sync raw data: " + meeting.title,
    );
  }
}

/**
 * Azure DevOps Git Pushes API. Works against dev.azure.com/{organization}
 * (cloud) or an on-prem Azure DevOps Server/TFS collection URL when
 * baseUrl is set (e.g. https://tfs.mycompany.com/tfs/DefaultCollection).
 *
 * All three files are written in a SINGLE push (one commit) because each
 * push needs the branch's current commit id, and doing three sequential
 * pushes would need to re-fetch that id between every file.
 * see https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pushes/create
 */
export class AzureDevOpsSyncClient {
  constructor(config) {
    this.token = config.token;
    this.repo = config.repo;
    this.project = config.project;
    this.branch = config.branch || "main";
    this.pathPrefix = config.pathPrefix || "meetings/";
    this.orgBase = (
      config.baseUrl || "https://dev.azure.com/" + config.owner
    ).replace(/\/$/, "");
  }

  get headers() {
    // FIX: base64(":" + PAT) is the documented Azure DevOps Basic Auth
    // scheme — empty username, colon, PAT. Do not remove the colon prefix.
    return {
      Authorization: "Basic " + base64EncodeUtf8(":" + this.token),
      "Content-Type": "application/json",
    };
  }

  get repoApiBase() {
    return (
      this.orgBase +
      "/" +
      encodeURIComponent(this.project) +
      "/_apis/git/repositories/" +
      encodeURIComponent(this.repo) +
      "/"
    );
  }

  async getLatestCommitId() {
    var url =
      this.repoApiBase +
      "refs?filter=" +
      encodeURIComponent("heads/" + this.branch) +
      "&api-version=7.1";
    var res = await fetch(url, { headers: this.headers });
    if (!res.ok)
      throw new Error(
        "Azure DevOps refs error " + res.status + " " + (await res.text()),
      );
    var json = await res.json();
    // All-zero object id is Azure DevOps' documented convention for
    // creating a brand-new branch.
    return (
      (json.value && json.value[0] && json.value[0].objectId) ||
      "0000000000000000000000000000000000000000"
    );
  }

  async fileExists(path) {
    var url =
      this.repoApiBase +
      "items?path=" +
      encodeURIComponent(path) +
      "&api-version=7.1";
    var res = await fetch(url, { headers: this.headers });
    return res.ok;
  }

  async syncMeeting(meeting, markdownContent) {
    var basePath = buildBasePath(this.pathPrefix, meeting);
    var files = [
      { path: basePath + "report.md", content: markdownContent },
      { path: basePath + "transcript.txt", content: meeting.plainTranscript },
      {
        path: basePath + "meeting.json",
        content: JSON.stringify(meeting, null, 2),
      },
    ];

    var oldObjectId = await this.getLatestCommitId();
    var self = this;
    var changes = await Promise.all(
      files.map(async function (file) {
        var exists = await self.fileExists(file.path);
        return {
          changeType: exists ? "edit" : "add",
          item: { path: file.path },
          newContent: { content: file.content, contentType: "rawtext" },
        };
      }),
    );

    var res = await fetch(this.repoApiBase + "pushes?api-version=7.1", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        refUpdates: [
          { name: "refs/heads/" + this.branch, oldObjectId: oldObjectId },
        ],
        commits: [
          { comment: "sync meeting: " + meeting.title, changes: changes },
        ],
      }),
    });
    if (!res.ok)
      throw new Error(
        "Azure DevOps push error " + res.status + " " + (await res.text()),
      );
    return res.json();
  }
}

export var SYNC_PROVIDER_TYPES = Object.freeze({
  GITHUB: "github",
  GITLAB: "gitlab",
  AZURE_DEVOPS: "azure-devops",
});

/**
 * Factory Pattern: turns the stored sync config into a live client instance.
 */
export class SyncProviderFactory {
  static create(config) {
    switch (config.provider) {
      case SYNC_PROVIDER_TYPES.GITLAB:
        return new GitLabSyncClient(config);
      case SYNC_PROVIDER_TYPES.AZURE_DEVOPS:
        return new AzureDevOpsSyncClient(config);
      case SYNC_PROVIDER_TYPES.GITHUB:
      default:
        return new GitHubSyncClient(config);
    }
  }
}
