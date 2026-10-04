#!/usr/bin/env node
// Package the static website for GitHub Pages:
//   node scripts/site/build-pages.mjs --site-data site-data --base /bazaar-calc/ [--repo owner/name] [--out pages]
// The site data comes from scripts/data/build-site.mjs; packages must be built first (pnpm -r build).
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = resolve(import.meta.dirname, "../..");
const siteData = resolve(arg("--site-data", "site-data")), out = resolve(arg("--out", "pages"));
let base = arg("--base", "/");
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base += "/";
if (!existsSync(join(siteData, "manifest.json"))) { console.error(`no site data in ${siteData} (run scripts/data/build-site.mjs first)`); process.exit(2); }

rmSync(out, { recursive: true, force: true });
execFileSync("npx", ["vite", "build", "--base", base, "--outDir", out, "--emptyOutDir"], {
  cwd: join(root, "packages/web"), stdio: "inherit",
  env: { ...process.env, VITE_STATIC: "1", VITE_REPO: arg("--repo", process.env.GITHUB_REPOSITORY ?? "") },
});
cpSync(siteData, join(out, "data"), { recursive: true });
mkdirSync(join(out, "collector"), { recursive: true });
copyFileSync(join(root, "packages/collector/dist/bazaar-calc-collector.mjs"), join(out, "collector/bazaar-calc-collector.mjs"));
// every page of the app is index.html; the fixed pages get their own copy (a normal 200 response), anything else
// (item pages) gets 404.html, which GitHub Pages serves for unknown paths: the app then shows the page asked for
for (const route of ["flips/bazaar", "flips/craft", "flips/book", "flips/forge", "flips/npc", "flips/kat", "flips/fusion", "dips", "orders", "alerts", "record", "outlook", "items", "events", "timing", "contribute", "api-docs", "status", "about"]) {
  mkdirSync(join(out, route), { recursive: true });
  copyFileSync(join(out, "index.html"), join(out, route, "index.html"));
}
// item pages too (every item with a data file), so links to them answer 200 instead of the 404 fallback
for (const f of readdirSync(join(out, "data/item"))) {
  const { id } = JSON.parse(readFileSync(join(out, "data/item", f), "utf8"));
  if (!/^[A-Za-z0-9_:;.-]+$/.test(id)) continue;
  mkdirSync(join(out, "item", id), { recursive: true });
  copyFileSync(join(out, "index.html"), join(out, "item", id, "index.html"));
}
copyFileSync(join(out, "index.html"), join(out, "404.html"));
// files and folders starting with "_" are fine; no Jekyll processing
execFileSync("touch", [join(out, ".nojekyll")]);
console.log(`static site in ${out} (base ${base})`);
