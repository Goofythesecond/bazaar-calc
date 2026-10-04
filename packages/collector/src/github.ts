// Commits files to a GitHub repository through the REST API (Git Data endpoints), so the scanner needs no git install.
// All files of one push go into one commit: the publish workflow then runs once per push, not once per file.
// The token needs "Contents: Read and write" on that one repository (a fine-grained personal access token). A push made
// with such a token starts workflows; one made with a workflow's own GITHUB_TOKEN would not.
// Never logs the token.

export interface PushFile { path: string; content: Uint8Array | string }
type Fetch = typeof fetch;

export class GitHubRepo {
  constructor(private readonly token: string, readonly repo: string, readonly branch = "main",
    private readonly api = "https://api.github.com", private readonly ua = "bazaar-calc-scanner", private readonly http: Fetch = fetch) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await this.http(`${this.api}/repos/${this.repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": this.ua,
        ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60_000),
    });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`GitHub ${method} ${path.split("?")[0]}: HTTP ${r.status} ${text.slice(0, 160).replace(/\s+/g, " ")}`), { status: r.status });
    return (text ? JSON.parse(text) : null) as T;
  }

  /** Can this token write to the repository? Stores one tiny blob that no commit uses (always the same one). */
  async checkWrite(): Promise<void> {
    await this.call("GET", `/git/ref/heads/${this.branch}`);
    await this.call("POST", "/git/blobs", { content: "bazaar-calc scanner write check\n", encoding: "utf-8" });
  }

  /** One commit adding or replacing `files` on the branch. Retries when the branch moved meanwhile (the publish workflow
   *  also commits); returns the new commit's sha. */
  async commit(files: PushFile[], message: string): Promise<string> {
    const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    for (const f of files) {
      const content = typeof f.content === "string" ? Buffer.from(f.content, "utf8") : Buffer.from(f.content);
      const { sha } = await this.call<{ sha: string }>("POST", "/git/blobs", { content: content.toString("base64"), encoding: "base64" });
      tree.push({ path: f.path, mode: "100644", type: "blob", sha });
    }
    for (let attempt = 1; ; attempt++) {
      const head = (await this.call<{ object: { sha: string } }>("GET", `/git/ref/heads/${this.branch}`)).object.sha;
      const base = (await this.call<{ tree: { sha: string } }>("GET", `/git/commits/${head}`)).tree.sha;
      const t = await this.call<{ sha: string }>("POST", "/git/trees", { base_tree: base, tree });
      const c = await this.call<{ sha: string }>("POST", "/git/commits", { message, tree: t.sha, parents: [head] });
      try {
        await this.call("PATCH", `/git/refs/heads/${this.branch}`, { sha: c.sha, force: false });
        return c.sha;
      } catch (e) {
        // 422 / 409: not a fast-forward any more (someone pushed between reading the branch and updating it)
        const status = (e as { status?: number }).status ?? 0;
        if (attempt >= 4 || (status !== 422 && status !== 409)) throw e;
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
  }
}
