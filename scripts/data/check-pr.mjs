#!/usr/bin/env node
// Check the data files a pull request adds (run by .github/workflows/check-data.yml, or locally):
//   node scripts/data/check-pr.mjs --author <github login> <file> [<file> ...]
//   node scripts/data/check-pr.mjs --author <login> --changes <file listing "STATUS<TAB>PATH" lines, as git diff --name-status prints>
//                                  [--root <dir where the pull request's files are>]
// A data pull request may only ADD .json.gz files to data/inbox/, named <author>_<UTC start>.json.gz. Each file is
// opened, checked for plausibility, and compared with every file already in the repository that covers the same time:
// everybody who polled a given Hypixel snapshot recorded identical values, so overlapping data must match exactly.
// Writes a Markdown report (to $GITHUB_STEP_SUMMARY when set) and exits 1 when something must be fixed.
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import zlib from "node:zlib";
import { DATA_FILE_RE, coverage, decodeDataFile, sanityCheck } from "@bc/shared";

const MAX_BYTES = 25 * 1024 * 1024; // GitHub's limit for files added in the browser
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const author = opt("--author"), changes = opt("--changes"), dataDir = opt("--data") ?? "data", root = opt("--root") ?? ".";
let added = argv;
const problems = [], notes = [], lines = [];

if (changes) {
  added = [];
  for (const l of readFileSync(changes, "utf8").split("\n").filter(Boolean)) {
    const [status, ...paths] = l.split("\t"), path = paths.at(-1);
    if (status === "A" && path.startsWith("data/inbox/") && path.endsWith(".json.gz")) added.push(join(root, path));
    else if (path !== "data/inbox/README.md" || status !== "M") problems.push(`\`${path}\` (${status}): a data pull request may only add .json.gz files to data/inbox/. Send code or other changes in a separate pull request.`);
  }
}
if (!added.length) problems.push("no data files found in this pull request (add .json.gz files to data/inbox/)");

// existing data, indexed by the start time in the file name (a file never covers more than 8 days)
const existing = [];
const walk = d => { if (!existsSync(d)) return; for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else { const m = DATA_FILE_RE.exec(n.replace(/_wayback(?=\.json\.gz$)/, "")); if (m) existing.push({ path: p, start: Date.parse(m[2].replace(/(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)/, "$1-$2-$3T$4:$5:00Z")) }); } } };
walk(join(dataDir, "contrib")); walk(join(dataDir, "inbox"));
const cache = new Map();
const load = p => { if (!cache.has(p)) { try { cache.set(p, decodeDataFile(zlib.gunzipSync(readFileSync(p)).toString())); } catch { cache.set(p, null); } } return cache.get(p); };

for (const path of added) {
  const name = basename(path);
  lines.push(`\n### ${name}`);
  const bad = msg => { problems.push(`\`${name}\`: ${msg}`); lines.push(`- ❌ ${msg}`); };
  if (!existsSync(path)) { bad("file not found"); continue; }
  const size = statSync(path).size;
  if (size > MAX_BYTES) { bad(`${(size / 1e6).toFixed(1)} MB: files must be at most 25 MB (split the day into two files)`); continue; }
  const m = DATA_FILE_RE.exec(name);
  if (!m) { bad("the name must be <your GitHub login>_<UTC start, yyyymmddThhmm>.json.gz, as the collector names it"); continue; }
  if (author && m[1].toLowerCase() !== author.toLowerCase()) { bad(`the name starts with "${m[1]}" but the pull request is from "${author}": only send files you recorded yourself`); continue; }
  let f;
  try { f = decodeDataFile(zlib.gunzipSync(readFileSync(path)).toString()); } catch (e) { bad(`cannot be read: ${e.message}`); continue; }
  if (f.name.toLowerCase() !== m[1].toLowerCase()) { bad(`recorded as "${f.name}" but named "${m[1]}"`); continue; }
  if (f.collector.kind === "export") { bad("exports of a server database are added by the maintainer directly, not through pull requests"); continue; }
  const { errors, warnings } = sanityCheck(f);
  for (const e of errors) bad(e);
  if (errors.length) continue;
  const c = coverage(f);
  lines.push(`- ✅ ${f.collector.kind} collector ${f.collector.version}, ${new Date(f.from).toISOString().slice(0, 16)}Z to ${new Date(f.to).toISOString().slice(0, 16)}Z`);
  lines.push(`- ${c.polls} bazaar polls (${c.hours.toFixed(1)} h of continuous polling), ${c.items} items, ${c.closes} hourly closes, ${c.episodes} time-on-top episodes, ${c.sales} auction sales, ${c.bins} lowest-BIN rows, ${f.election.length} election snapshots`);
  for (const w of warnings) { lines.push(`- ⚠️ ${w}`); notes.push(`\`${name}\`: ${w}`); }

  // compare with every other file covering the same time
  const polls = new Map(f.polls.map((t, i) => [t, i]));
  const closeAt = new Map(); // `${pollTs}|${item}` -> values
  for (let i = 0; i < f.closes.item.length; i++) closeAt.set(`${f.polls[f.closes.poll[i]]}|${f.items[f.closes.item[i]]}`, i);
  const epKey = (file, i) => `${file.items[file.episodes.item[i]]}|${file.episodes.side[i]}|${file.episodes.start[i]}`;
  const myEps = new Map(); for (let i = 0; i < f.episodes.item.length; i++) myEps.set(epKey(f, i), i);
  const mySales = new Set(f.ah.sales.ts.map((t, i) => `${f.ah.keys[f.ah.sales.key[i]]}|${t}|${f.ah.sales.price[i]}`));
  let overlapFiles = 0, sharedPolls = 0, cmpCloses = 0, badCloses = 0, cmpEps = 0, badEps = 0, sharedSales = 0, otherSales = 0;
  const examples = [];
  for (const e of existing) {
    if (e.path === path || e.start > f.to || e.start < f.from - 8 * 86400_000) continue;
    const g = load(e.path);
    if (!g || g.to < f.from || g.from > f.to) continue;
    const common = g.polls.filter(t => polls.has(t));
    let used = common.length > 0;
    sharedPolls += common.length;
    for (let i = 0; i < g.closes.item.length; i++) {
      const j = closeAt.get(`${g.polls[g.closes.poll[i]]}|${g.items[g.closes.item[i]]}`);
      if (j == null) continue;
      cmpCloses++;
      const cols = ["ask", "bid", "askVol", "bidVol", "askOrders", "bidOrders", "buyWeek", "sellWeek"];
      const diff = cols.filter(k => f.closes[k][j] !== g.closes[k][i]);
      if (diff.length) { badCloses++; if (examples.length < 5) examples.push(`${g.items[g.closes.item[i]]} at ${new Date(g.polls[g.closes.poll[i]]).toISOString()}: ${diff.map(k => `${k} ${f.closes[k][j]} vs ${g.closes[k][i]}`).join(", ")} (${basename(e.path)})`); }
    }
    // episodes that both recorded from start to end while both were polling
    const lo = Math.max(f.polls[0] ?? Infinity, g.polls[0] ?? Infinity), hi = Math.min(f.polls.at(-1) ?? -Infinity, g.polls.at(-1) ?? -Infinity);
    for (let i = 0; i < g.episodes.item.length; i++) {
      const s = g.episodes.start[i], end = s + g.episodes.dur[i] * 100;
      if (s <= lo || end >= hi || g.episodes.end[i] === 2) continue;
      const j = myEps.get(epKey(g, i));
      if (j == null) continue; // the other file may have had a gap here
      cmpEps++;
      if (f.episodes.dur[j] !== g.episodes.dur[i] || f.episodes.flow[j] !== g.episodes.flow[i] || f.episodes.end[j] !== g.episodes.end[i]) badEps++;
    }
    const range = xs => xs.reduce(([a, b], t) => [Math.min(a, t), Math.max(b, t)], [Infinity, -Infinity]);
    const [fa, fb] = range(f.ah.sales.ts), [ga, gb] = range(g.ah.sales.ts), sLo = Math.max(fa, ga), sHi = Math.min(fb, gb);
    for (let i = 0; i < g.ah.sales.ts.length; i++) {
      const t = g.ah.sales.ts[i];
      if (t < sLo || t > sHi) continue;
      used = true; otherSales++;
      if (mySales.has(`${g.ah.keys[g.ah.sales.key[i]]}|${t}|${g.ah.sales.price[i]}`)) sharedSales++;
    }
    if (used) overlapFiles++;
  }
  if (!overlapFiles) lines.push("- ℹ️ no other data covers this time, so it cannot be cross-checked (it is checked against later contributions instead)");
  else {
    lines.push(`- overlaps ${overlapFiles} file(s): ${sharedPolls} identical Hypixel snapshots, ${cmpCloses} hourly closes compared (${badCloses} differ), ${cmpEps} time-on-top episodes compared (${badEps} differ), ${sharedSales} of ${otherSales} auction sales in the shared time also recorded here`);
    for (const x of examples) lines.push(`  - differs: ${x}`);
    if (badCloses > 0) bad(`${badCloses} of ${cmpCloses} prices differ from other recordings of the same Hypixel snapshots (identical snapshots must give identical values)`);
    if (cmpEps >= 20 && badEps / cmpEps > 0.01) bad(`${badEps} of ${cmpEps} time-on-top episodes differ from other recordings of the same snapshots`);
    if (otherSales >= 50 && sharedSales / otherSales < 0.8) notes.push(`\`${name}\`: only ${sharedSales} of ${otherSales} auction sales recorded by others in the same time are in this file (missed polls?)`);
  }
}

const report = [`## Data check: ${problems.length ? "❌ needs changes" : "✅ passed"}`, ...(problems.length ? ["", "**To fix:**", ...problems.map(p => `- ${p}`)] : []),
  ...(notes.length ? ["", "**For the maintainer:**", ...notes.map(n => `- ${n}`)] : []), ...lines].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
process.exitCode = problems.length ? 1 : 0;
