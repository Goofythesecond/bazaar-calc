#!/usr/bin/env node
// Architecture check: the structural rules that keep this repository easy to change for people and AI agents.
// Needs no install (Node built-ins only), so it runs first in CI (.github/workflows/architecture.yml).
//   node scripts/checks/architecture.mjs        exits 1 and lists every problem with how to fix it
// Rules (docs/ARCHITECTURE.md explains why):
//   1. packages depend only in the allowed direction (web and collector never on server code)
//   2. @bc/shared runs in browsers: no node:* imports outside tests, only zod as an outside dependency
//   3. @bc/shared modules are layered; across modules only through the module's index.ts; no import cycles
//   4. every source, script and workflow file starts with a comment saying what it is for (its role)
//   5. every package and every shared module has a README.md that names each of its source files
//   6. every repository path written in documentation or comments exists (docs never point at moved files)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const problems = [];
const add = (rule, file, msg, fix) => problems.push({ rule, file, msg, fix });
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n").filter(f => f && existsSync(f));
const read = f => readFileSync(f, "utf8");
const isSource = f => /^packages\/[^/]+\/src\/.+\.(ts|tsx|mjs)$/.test(f) && !f.endsWith(".d.ts");
const importsOf = text => [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^"'`;]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
  .map(m => m[1] ?? m[2] ?? m[3]);

// ---- 1. package dependencies
const PACKAGE_DEPS = {
  // api's all.ts runs the scanner (worker) and the API in one process for small self-hosted setups
  shared: [], "server-core": ["shared"], api: ["shared", "server-core", "worker"], worker: ["shared", "server-core"],
  web: ["shared"], collector: ["shared"],
};
for (const f of files.filter(isSource)) {
  const pkg = f.split("/")[1];
  if (!(pkg in PACKAGE_DEPS)) { add(1, f, `package "${pkg}" is not listed in PACKAGE_DEPS`, "add it to PACKAGE_DEPS in scripts/checks/architecture.mjs and to docs/ARCHITECTURE.md"); continue; }
  for (const spec of importsOf(read(f))) {
    const m = /^@bc\/([^/]+)(\/.*)?$/.exec(spec);
    if (!m) continue;
    if (m[2]) add(1, f, `imports "${spec}": other packages are used through their entry point only`, `import from "@bc/${m[1]}"`);
    else if (!PACKAGE_DEPS[pkg].includes(m[1])) add(1, f, `package ${pkg} may not depend on @bc/${m[1]} (allowed: ${PACKAGE_DEPS[pkg].join(", ") || "none"})`, "move the shared part into @bc/shared, or change the dependency rules on purpose (docs/ARCHITECTURE.md)");
  }
}

// ---- 2 + 3. @bc/shared: browser-safe, layered modules
const SHARED = "packages/shared/src/";
const MODULES = ["rules", "market", "recipes", "fill", "calc", "data", "service"]; // lowest layer first
const MAY_USE = {
  rules: [], market: ["rules"], recipes: ["rules"], fill: ["rules", "market"],
  calc: ["rules", "market", "recipes", "fill"], data: ["rules", "market", "fill"], service: ["rules", "market", "recipes", "fill", "calc"],
};
const sharedFiles = files.filter(f => f.startsWith(SHARED) && f.endsWith(".ts"));
const graph = new Map();
for (const f of sharedFiles) {
  const rel = f.slice(SHARED.length), mod = rel.includes("/") ? rel.split("/")[0] : null, test = f.endsWith(".test.ts");
  if (rel !== "index.ts" && !MODULES.includes(mod)) { add(3, f, "file outside the shared modules", `put it in one of: ${MODULES.join(", ")} (packages/shared/README.md)`); continue; }
  const edges = [];
  for (const spec of importsOf(read(f))) {
    if (spec.startsWith("node:")) { if (!test) add(2, f, `imports ${spec}, but @bc/shared also runs in browsers`, "do the Node-only part in server-core, scripts or the collector and pass the result in"); continue; }
    if (!spec.startsWith(".")) { if (!test && spec !== "zod") add(2, f, `imports the outside package "${spec}"`, "@bc/shared may only depend on zod; keep it dependency-free"); continue; }
    const target = normalize(join(dirname(rel), spec)).replace(/\.js$/, "");
    if (spec.endsWith(".json")) continue;
    edges.push(target);
    if (rel === "index.ts") { if (!/^[a-z-]+\/index$/.test(target)) add(3, f, `the package entry point re-exports "${spec}"`, "re-export module index files only"); continue; }
    if (test) continue;
    const tmod = target.includes("/") ? target.split("/")[0] : null;
    if (tmod === mod) continue;
    if (target === "index") { add(3, f, `imports the package entry point "${spec}" from inside the package`, "import from the module that defines it"); continue; }
    if (!MAY_USE[mod]?.includes(tmod)) add(3, f, `module "${mod}" imports module "${tmod}", which is not below it (${mod} may use: ${MAY_USE[mod]?.join(", ") || "nothing"})`, "move the code to the lower module, or pass it in as a parameter");
    else if (!target.endsWith("/index")) add(3, f, `imports "${spec}" directly; other modules are used through their index.ts`, `import from "../${tmod}/index.js"`);
  }
  graph.set(rel.replace(/\.ts$/, ""), edges);
}
// cycles between files (modules are layered, so a cycle would be inside one module)
const state = new Map();
const visit = (n, path) => {
  if (state.get(n) === 2) return;
  if (state.get(n) === 1) { const c = path.slice(path.indexOf(n)); add(3, SHARED + n + ".ts", `import cycle: ${[...c, n].join(" -> ")}`, "move the shared part into its own file that both import"); return; }
  state.set(n, 1);
  for (const m of graph.get(n) ?? []) if (graph.has(m)) visit(m, [...path, n]);
  state.set(n, 2);
};
for (const n of graph.keys()) visit(n, []);

// ---- 4. role comment at the top of every source, script and workflow file
const roleFiles = files.filter(f => isSource(f) || /^scripts\/.+\.(mjs|sh)$/.test(f) || /^\.github\/workflows\/.+\.ya?ml$/.test(f) || /^packages\/[^/]+\/vite\.config\.ts$/.test(f));
for (const f of roleFiles) {
  const lines = read(f).split("\n").filter((l, i) => !(i === 0 && l.startsWith("#!")));
  const first = (lines.find(l => l.trim() !== "") ?? "").trim();
  const ok = f.endsWith(".yml") || f.endsWith(".yaml") || f.endsWith(".sh") ? first.startsWith("#") : first.startsWith("//") || first.startsWith("/*");
  if (!ok) add(4, f, "does not start with a comment saying what the file is for", "add one or two lines at the top: its role, and what it must not do if that is not obvious");
}

// ---- 5. READMEs that name every file
const needReadme = [...new Set(files.filter(f => /^packages\/[^/]+\/package\.json$/.test(f)).map(f => dirname(f)))]
  .concat(MODULES.map(m => SHARED + m), ["scripts"]);
for (const dir of needReadme) {
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) { add(5, dir, "has no README.md", "add one: what it is for, its files, what depends on it (see the other READMEs)"); continue; }
  const text = read(readme);
  const own = dir === "scripts"
    ? files.filter(f => /^scripts\/.+\.(mjs|sh)$/.test(f) && !f.includes(".tmp."))
    : dir.startsWith(SHARED) ? files.filter(f => dirname(f) === dir && f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith("index.ts")) : [];
  for (const f of own) {
    const name = dir === "scripts" ? f.slice("scripts/".length) : f.slice(dir.length + 1);
    if (!text.includes(name)) add(5, readme, `does not mention ${name}`, `add a line for ${name} (what it does)`);
  }
}

// ---- 6. repository paths in documentation and comments must exist
const GENERATED = /(^|\/)(dist|node_modules)(\/|$)|^(data\/pg|site-data|pages|export)(\/|$)/;
const pathRe = /(?<![\w./@-])((?:packages|scripts|docs|data|db|deploy|research|\.github)\/[\w./@~-]*[\w/])/g;
// read in full: documentation, workflows and package.json scripts (commands run these paths); code: comments only
const fullText = f => f.endsWith(".md") || /\.ya?ml$/.test(f) || f.endsWith("package.json");
const docFiles = files.filter(f => (f.endsWith(".md") && !f.startsWith("data/")) || roleFiles.includes(f) || isSource(f) || /(^|\/)package\.json$/.test(f));
for (const f of docFiles) {
  const text = read(f);
  const scan = fullText(f) ? text : text.split("\n").filter(l => /^\s*(\/\/|\*|\/\*|#)/.test(l) || l.includes("// ")).join("\n");
  const seen = new Set();
  for (const m of scan.matchAll(pathRe)) {
    let p = m[1].replace(/[.,;:)]+$/, "").replace(/\/$/, "");
    if (seen.has(p) || /<|\*|\$\{|\{/.test(text.slice(m.index, m.index + m[0].length + 1)) || GENERATED.test(p)) continue;
    seen.add(p);
    if (!existsSync(p) && !existsSync(p.replace(/\.js$/, ".ts"))) add(6, f, `mentions ${p}, which does not exist`, "update the path (the file moved?) or remove the mention");
  }
  if (f.endsWith(".md")) for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+)/g)) {
    const p = normalize(join(dirname(f), m[1]));
    if (!existsSync(p) && !GENERATED.test(p)) add(6, f, `links to ${m[1]}, which does not exist`, "fix the link");
  }
}

// ---- report
const RULES = { 1: "package dependencies", 2: "@bc/shared runs in browsers", 3: "shared module layers", 4: "role comments", 5: "READMEs", 6: "paths in docs and comments" };
if (!problems.length) { console.log(`architecture: OK (${files.filter(isSource).length} source files, ${sharedFiles.length} in @bc/shared, ${docFiles.length} files scanned for paths)`); process.exit(0); }
for (const [r, name] of Object.entries(RULES)) {
  const ps = problems.filter(p => p.rule === Number(r));
  if (!ps.length) continue;
  console.log(`\n${r}. ${name}: ${ps.length} problem(s)`);
  for (const p of ps) console.log(`  ${p.file}: ${p.msg}\n    fix: ${p.fix}`);
}
console.log(`\narchitecture: ${problems.length} problem(s). docs/ARCHITECTURE.md explains the rules.`);
process.exit(1);
