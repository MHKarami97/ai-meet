/**
 * Optional GitHub archival: writes each meeting's Markdown report, raw
 * transcript and JSON as three files per meeting using GitHub's Contents API.
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
    const json = await res.json();
    return json.sha;
  }

  async putFile(path, contentUtf8, message) {
    const sha = await this.getExistingSha(path);
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(contentUtf8))),
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
    const dateFolder = new Date(meeting.startedAt).toISOString().slice(0, 10);
    const safeTitle =
      meeting.title.replace(/[^\u0600-\u06FFa-zA-Z0-9-_ ]/g, "").slice(0, 60) ||
      meeting.id;
    const basePath = `${this.pathPrefix}/${dateFolder}-${safeTitle}/`;

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
