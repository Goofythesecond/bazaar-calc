// GitHubRepo (src/github.ts) against a fake GitHub API: one commit holds every file, it is based on the branch head, a
// branch that moved meanwhile is retried on the new head, and other errors are not retried.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GitHubRepo } from "../dist/test/github.mjs";

function fakeGitHub({ raceOnce = false, failBlob = 0 } = {}) {
  const st = { head: "c0", commits: { c0: { tree: "t0", parents: [] } }, blobs: {}, trees: {}, calls: [], raced: false, n: 0 };
  const http = async (url, init) => {
    const path = url.replace("https://api.github.com/repos/o/r", ""), method = init.method, body = init.body ? JSON.parse(init.body) : null;
    st.calls.push(`${method} ${path}`);
    assert.equal(init.headers.authorization, "Bearer tok");
    const ok = (v, status = 200) => new Response(JSON.stringify(v), { status });
    if (method === "POST" && path === "/git/blobs") { if (failBlob) return ok({ message: "Bad credentials" }, failBlob); const sha = `b${++st.n}`; st.blobs[sha] = Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8").toString(); return ok({ sha }); }
    if (method === "GET" && path === "/git/ref/heads/main") return ok({ object: { sha: st.head } });
    if (method === "GET" && path.startsWith("/git/commits/")) { const c = st.commits[path.split("/").pop()]; return ok({ tree: { sha: c.tree } }); }
    if (method === "POST" && path === "/git/trees") { const sha = `t${++st.n}`; st.trees[sha] = body; return ok({ sha }); }
    if (method === "POST" && path === "/git/commits") { const sha = `c${++st.n}`; st.commits[sha] = { tree: body.tree, parents: body.parents, message: body.message }; return ok({ sha }); }
    if (method === "PATCH" && path === "/git/refs/heads/main") {
      assert.equal(body.force, false);
      if (raceOnce && !st.raced) { st.raced = true; st.head = "cX"; st.commits.cX = { tree: "tX", parents: ["c0"] }; return ok({ message: "Update is not a fast forward" }, 422); }
      if (st.commits[body.sha].parents[0] !== st.head) return ok({ message: "Update is not a fast forward" }, 422);
      st.head = body.sha; return ok({ object: { sha: body.sha } });
    }
    return ok({ message: "Not Found" }, 404);
  };
  return { st, http };
}
const repo = http => new GitHubRepo("tok", "o/r", "main", "https://api.github.com", "test", http);

test("all files in one commit on top of the branch head", async () => {
  const { st, http } = fakeGitHub();
  const sha = await repo(http).commit([{ path: "data/contrib/x/2026-10/a.json.gz", content: new Uint8Array([1, 2, 3]) }, { path: "data/paper/x.json", content: "{}" }], "Data");
  assert.equal(st.head, sha);
  const tree = st.trees[st.commits[sha].tree];
  assert.equal(tree.base_tree, "t0");
  assert.deepEqual(tree.tree.map(t => t.path), ["data/contrib/x/2026-10/a.json.gz", "data/paper/x.json"]);
  assert.deepEqual(st.commits[sha].parents, ["c0"]);
  assert.equal(st.blobs[tree.tree[1].sha], "{}");
  assert.equal(st.calls.filter(c => c.startsWith("PATCH")).length, 1);
});

test("a branch that moved meanwhile: retried on the new head, nothing lost", async () => {
  const { st, http } = fakeGitHub({ raceOnce: true });
  const sha = await repo(http).commit([{ path: "a", content: "1" }], "Data");
  assert.equal(st.head, sha);
  assert.deepEqual(st.commits[sha].parents, ["cX"]);
  assert.equal(st.trees[st.commits[sha].tree].base_tree, "tX");
  assert.equal(st.calls.filter(c => c.startsWith("PATCH")).length, 2);
});

test("a bad token fails at once, without retries", async () => {
  const { st, http } = fakeGitHub({ failBlob: 401 });
  await assert.rejects(repo(http).commit([{ path: "a", content: "1" }], "Data"), /HTTP 401/);
  assert.equal(st.calls.length, 1);
  await assert.rejects(repo(http).checkWrite(), /HTTP 401/);
});
