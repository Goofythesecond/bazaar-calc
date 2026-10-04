// Bazaar Calc data collector. Polls Hypixel's public (key-less) endpoints and records contribution data files for the
// project's GitHub repository: hourly prices, order-book flow, time-on-top episodes, auction lowest BINs and sale prices.
// Nothing about players is recorded. Bundled into one file with no dependencies (Node 18 or newer):
//   node bazaar-calc-collector.mjs --name <your GitHub login> [--out ./bazaar-data] [--no-bins]
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import zlib from "node:zlib";
import { DataCollector, coverage, dataFileName, encodeDataFile } from "@bc/shared";
import { startPolling } from "./poll.js";

const VERSION = "node-1";
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Bazaar Calc data collector ${VERSION}
  --name <login>     your GitHub username (required; files are named after it)
  --out <dir>        where files go (default ./bazaar-data)
  --no-bins          skip the auction lowest-BIN scan (about 60 MB every 30 min)
  --bins-every <min> minutes between BIN scans (default 30)`);
  process.exit(0);
}
const NAME = opt("--name") ?? "";
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(NAME)) { console.error("Give your GitHub username: --name <login>   (see --help)"); process.exit(2); }
const OUT = resolve(opt("--out") ?? "bazaar-data");
const BINS = !args.includes("--no-bins"), BINS_EVERY = Math.max(10, Number(opt("--bins-every") ?? 30)) * 60_000;
mkdirSync(OUT, { recursive: true });

const UA = `bazaar-calc-collector/${VERSION} (open-source SkyBlock market calculator)`;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);

const col = new DataCollector(NAME, "node", VERSION);
let file: string | null = null; // the file the current data goes to (fixed when its first data arrives)

function fileFor(from: number): string {
  const base = dataFileName({ name: NAME, from });
  for (let i = 1; ; i++) { const n = i === 1 ? base : base.replace(".json.gz", `_${i}.json.gz`); if (!existsSync(join(OUT, n))) return join(OUT, n); }
}
/** Write everything recorded into the current day's file (atomically: a crash never leaves half a file). */
function save() {
  if (!col.hasData) return;
  const f = col.snapshot();
  file ??= fileFor(f.from);
  const gz = zlib.gzipSync(encodeDataFile(f), { level: 9 });
  writeFileSync(`${file}.tmp`, gz);
  renameSync(`${file}.tmp`, file);
  return { bytes: gz.length, hours: coverage(f).hours };
}
function rollover() { const r = save(); if (r) log(`finished ${file} (${(r.bytes / 1e6).toFixed(1)} MB, ${r.hours.toFixed(1)} h)`); col.reset(); file = null; }

const poll = startPolling(col, {
  ua: UA, bins: BINS, binsEveryMs: BINS_EVERY, log,
  beforeBazaar: d => { if (col.hasData && Math.floor(d.lastUpdated / 86400_000) !== Math.floor(col.from / 86400_000)) rollover(); }, // new UTC day
});
const counts = poll.counts;
setInterval(() => {
  try { const r = save(); if (r) log(`saved ${file}: ${col.polls} polls, ${r.hours.toFixed(1)} h, ${counts.sales} sales, ${counts.scans} BIN scans, ${(r.bytes / 1e6).toFixed(1)} MB${counts.errors ? `, ${counts.errors} errors` : ""}`); }
  catch (e) { log(`save failed: ${(e as Error).message}`); }
}, 5 * 60_000);

const stop = () => { log("stopping..."); poll.stop(); col.flush(); try { const r = save(); if (r) log(`saved ${file}`); } finally { process.exit(0); } };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
log(`collecting as ${NAME} into ${OUT} (bazaar every 20 s, auction sales every 30 s${BINS ? `, lowest BINs every ${BINS_EVERY / 60_000} min (~60 MB each; --no-bins to skip)` : ""})`);
log("upload the finished .json.gz files to the project's GitHub repository, folder data/inbox (see the Contribute page). Ctrl+C to stop.");
