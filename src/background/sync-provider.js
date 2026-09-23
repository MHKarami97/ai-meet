function base64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * GitHub Contents API.
 * @see https://docs.github.com/en/rest/repos/contents
 */
export class GitHubSyncClient {
  constructor({
    token,
    owner,
    repo,
    branch = "main",
    pathPrefix = "meetings",
  }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.pathPrefix = pathPrefix;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  get apiBase() {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/contents/`;
  }

  async getExistingSha(path) {
    const res = await fetch(`${this.apiBase}${path}?ref=${this.branch}`, {
      headers: this.headers,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub read error ${res.status}`);
    return (await res.json()).sha;
  }

  async putFile(path, contentUtf8, message) {
    const sha = await this.getExistingSha(path);
    const body = {
      message,
      content: base64EncodeUtf8(contentUtf8),
      branch: this.branch,
      ...(sha ? { sha } : {}),
    };
    const res = await fetch(`${this.apiBase}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    if (!res.ok)
      throw new Error(`GitHub write error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async syncMeeting(meeting, markdownContent) {
    const basePath = buildBasePath(this.pathPrefix, meeting);
    await this.putFile(
      `${basePath}report.md`,
      markdownContent,
      `sync report: ${meeting.title}`,
    );
    await this.putFile(
      `${basePath}transcript.txt`,
      meeting.plainTranscript,
      `sync transcript: ${meeting.title}`,
    );
    await this.putFile(
      `${basePath}meeting.json`,
      JSON.stringify(meeting, null, 2),
      `sync raw data: ${meeting.title}`,
    );
  }
}

/**
 * GitLab Repository Files API. Works against gitlab.com or any self-hosted
 * instance when `baseUrl` (e.g. "https://gitlab.mycompany.com") is set.
 * @see https://docs.gitlab.com/api/repository_files/
 */
export class GitLabSyncClient {
  constructor({
    token,
    owner,
    repo,
    branch = "main",
    pathPrefix = "meetings",
    baseUrl = "",
  }) {
    this.token = token;
    // GitLab identifies a project by its full namespace path, e.g. "group/subgroup/project".
    // `owner` + `repo` are joined here so users can fill them in the same two fields as GitHub.
    this.projectPath = repo.includes("/") ? repo : `${owner}/${repo}`;
    this.branch = branch;
    this.pathPrefix = pathPrefix;
    this.apiBase = `${(baseUrl || "https://gitlab.com").replace(/\/$/, "")}/api/v4`;
  }

  get headers() {
    return { "PRIVATE-TOKEN": this.token, "Content-Type": "application/json" };
  }

  get encodedProjectId() {
    return encodeURIComponent(this.projectPath);
  }

  async fileExists(path) {
    const res = await fetch(
      `${this.apiBase}/projects/${this.encodedProjectId}/repository/files/${encodeURIComponent(path)}?ref=${this.branch}`,
      { headers: this.headers },
    );
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`GitLab read error ${res.status}`);
    return true;
  }

  async putFile(path, contentUtf8, message) {
    const exists = await this.fileExists(path);
    const url = `${this.apiBase}/projects/${this.encodedProjectId}/repository/files/${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: exists ? "PUT" : "POST",
      headers: this.headers,
      body: JSON.stringify({
        branch: this.branch,
        content: contentUtf8,
        commit_message: message,
      }),
    });
    if (!res.ok)
      throw new Error(`GitLab write error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async syncMeeting(meeting, markdownContent) {
    const basePath = buildBasePath(this.pathPrefix, meeting);
    await this.putFile(
      `${basePath}report.md`,
      markdownContent,
      `sync report: ${meeting.title}`,
    );
    await this.putFile(
      `${basePath}transcript.txt`,
      meeting.plainTranscript,
      `sync transcript: ${meeting.title}`,
    );
    await this.putFile(
      `${basePath}meeting.json`,
      JSON.stringify(meeting, null, 2),
      `sync raw data: ${meeting.title}`,
    );
  }
}

/**
 * Azure DevOps Git Pushes API. Works against dev.azure.com/{organization}
 * (cloud) or an on-prem Azure DevOps Server/TFS collection URL when
 * `baseUrl` is set (e.g. "https://tfs.mycompany.com/tfs/DefaultCollection").
 * All three files are written in a SINGLE push (one commit) because each
 * push needs the branch's current commit id, and doing three sequential
 * pushes would need to re-fetch that id between every file.
 * @see https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pushes/create
 */
export class AzureDevOpsSyncClient {
  constructor({
    token,
    owner,
    repo,
    project,
    branch = "main",
    pathPrefix = "meetings",
    baseUrl = "",
  }) {
    this.token = token;
    this.repo = repo;
    this.project = project;
    this.branch = branch;
    this.pathPrefix = pathPrefix;
    this.orgBase = (baseUrl || `https://dev.azure.com/${owner}`).replace(
      /\/$/,
      "",
    );
  }

  get headers() {
    return {
      Authorization: `Basic ${base64EncodeUtf8(`:${this.token}`)}`,
      "Content-Type": "application/json",
    };
  }

  get repoApiBase() {
    return `${this.orgBase}/${encodeURIComponent(this.project)}/_apis/git/repositories/${encodeURIComponent(this.repo)}`;
  }

  async getLatestCommitId() {
    const res = await fetch(
      `${this.repoApiBase}/refs?filter=${encodeURIComponent(`heads/${this.branch}`)}&api-version=7.1`,
      {
        headers: this.headers,
      },
    );
    if (!res.ok)
      throw new Error(
        `Azure DevOps refs error ${res.status}: ${await res.text()}`,
      );
    const json = await res.json();
    // All-zero object id is Azure DevOps' documented convention for creating a brand-new branch.
    return (
      json.value?.[0]?.objectId || "0000000000000000000000000000000000000000"
    );
  }

  async fileExists(path) {
    const res = await fetch(
      `${this.repoApiBase}/items?path=${encodeURIComponent(path)}&api-version=7.1`,
      { headers: this.headers },
    );
    return res.ok;
  }

  async syncMeeting(meeting, markdownContent) {
    const basePath = buildBasePath(this.pathPrefix, meeting);
    const files = [
      { path: `${basePath}report.md`, content: markdownContent },
      { path: `${basePath}transcript.txt`, content: meeting.plainTranscript },
      {
        path: `${basePath}meeting.json`,
        content: JSON.stringify(meeting, null, 2),
      },
    ];

    const oldObjectId = await this.getLatestCommitId();
    const changes = await Promise.all(
      files.map(async (file) => ({
        changeType: (await this.fileExists(`/${file.path}`)) ? "edit" : "add",
        item: { path: `/${file.path}` },
        newContent: { content: file.content, contentType: "rawtext" },
      })),
    );

    const res = await fetch(`${this.repoApiBase}/pushes?api-version=7.1`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        refUpdates: [{ name: `refs/heads/${this.branch}`, oldObjectId }],
        commits: [{ comment: `sync meeting: ${meeting.title}`, changes }],
      }),
    });
    if (!res.ok)
      throw new Error(
        `Azure DevOps push error ${res.status}: ${await res.text()}`,
      );
    return res.json();
  }
}

function buildBasePath(pathPrefix, meeting) {
  const dateFolder = new Date(meeting.startedAt).toISOString().slice(0, 10);
  const safeTitle =
    meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]/g, "").slice(0, 60) ||
    meeting.id;
  return `${pathPrefix}/${dateFolder}-${safeTitle}/`;
}

export const SYNC_PROVIDER_TYPES = Object.freeze({
  GITHUB: "github",
  GITLAB: "gitlab",
  AZURE_DEVOPS: "azure-devops",
});

/** Factory Pattern: turns the stored sync config into a live client instance. */
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
