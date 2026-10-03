// Bazaar Calc data collector. Polls Hypixel's public (key-less) endpoints and records contribution data files for the
// project's GitHub repository: hourly prices, order-book flow, time-on-top episodes, auction lowest BINs and sale prices.
// Nothing about players is recorded. Bundled into one file with no dependencies (Node 18 or newer):
//   node bazaar-calc-collector.mjs --name <your GitHub login> [--out ./bazaar-data] [--no-bins]
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import zlib from "node:zlib";
import {
  type AuctionsPage, type BazaarResponse, type ElectionResponse, type EndedAuctions, DataCollector, HYPIXEL, aggregateBins, auctionItemKey, coverage,
  dataFileName, encodeDataFile,
} from "@bc/shared";

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
const lastModified = new Map<string, string>();
/** GET JSON; null when unchanged since the last call (If-Modified-Since). Retries network errors and 429 / 5xx. */
async function get<T>(url: string, ifChanged = false): Promise<T | null> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const since = ifChanged ? lastModified.get(url) : undefined;
      const r = await fetch(url, { headers: { "user-agent": UA, ...(since ? { "if-modified-since": since } : {}) }, signal: AbortSignal.timeout(60_000) });
      if (r.status === 304) return null;
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} ${url}`), { fatal: true });
      const body = (await r.json()) as T;
      const lm = r.headers.get("last-modified");
      if (ifChanged && lm) lastModified.set(url, lm);
      return body;
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
  throw last;
}
const itemKey = (b64: string) => { try { return auctionItemKey(new Uint8Array(zlib.gunzipSync(Buffer.from(b64, "base64")))); } catch { return null; } };
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);

const col = new DataCollector(NAME, "node", VERSION);
let file: string | null = null; // the file the current data goes to (fixed when its first data arrives)
let sales = 0, scans = 0, errors = 0;

function fileFor(from: number): string {
  const base = dataFileName({ name: NAME, from });
  for (let i = 1; ; i++) { const n = i === 1 ? base : base.replace(".json.gz", `_${i}.json.gz`); if (!existsSync(join(OUT, n))) return join(OUT, n); }
}
/** Write everything recorded into the current day's file (atomically: a crash never leaves half a file). */
function save() {
  if (!col.hasData) return;
  file ??= fileFor(col.snapshot().from);
  const f = col.snapshot();
  const gz = zlib.gzipSync(encodeDataFile(f), { level: 9 });
  writeFileSync(`${file}.tmp`, gz);
  renameSync(`${file}.tmp`, file);
  return { bytes: gz.length, hours: coverage(f).hours };
}
function rollover() { const r = save(); if (r) log(`finished ${file} (${(r.bytes / 1e6).toFixed(1)} MB, ${r.hours.toFixed(1)} h)`); col.reset(); file = null; }

const loop = (name: string, every: number, fn: () => Promise<void>) => {
  const run = async () => { const t0 = Date.now(); try { await fn(); } catch (e) { errors++; log(`${name} failed: ${(e as Error).message}`); } setTimeout(run, Math.max(1000, every - (Date.now() - t0))); };
  void run();
};

loop("bazaar", 20_000, async () => {
  const d = await get<BazaarResponse>(`${HYPIXEL}/skyblock/bazaar`, true);
  if (!d) return;
  if (col.hasData && Math.floor(d.lastUpdated / 86400_000) !== Math.floor(col.from / 86400_000)) rollover(); // new UTC day
  if (col.addBazaar(d) === "rejected") log(`bazaar response skipped: ${col.rejected.at(-1)?.reason}`);
});
// the endpoint lists about the last minute of sales: every 30 s so none fall between two polls
loop("auctions_ended", 30_000, async () => {
  const d = await get<EndedAuctions>(`${HYPIXEL}/skyblock/auctions_ended`, true);
  if (!d) return;
  const list = [];
  for (const a of d.auctions ?? []) { const k = itemKey(a.item_bytes); if (k) list.push({ key: k.key, ts: a.timestamp, price: a.price / k.count, bin: a.bin }); }
  sales += col.addSales(list);
});
loop("election", 3600_000, async () => { const d = await get<ElectionResponse>(`${HYPIXEL}/resources/skyblock/election`); if (d) col.addElection(d); });
if (BINS) loop("auction BIN scan", BINS_EVERY, async () => {
  const first = await get<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=0`);
  if (!first) return;
  const rest: AuctionsPage[] = [];
  for (let i = 1; i < first.totalPages; i += 8) rest.push(...(await Promise.all(Array.from({ length: Math.min(8, first.totalPages - i) }, (_, j) => get<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=${i + j}`)))).filter((p): p is AuctionsPage => !!p));
  if (rest.length !== first.totalPages - 1) { log("auction scan incomplete, not stored"); return; } // incomplete scans are never stored
  const agg = await aggregateBins(first.auctions, a => itemKey(a));
  for (const p of rest) await aggregateBins(p.auctions, a => itemKey(a), agg);
  col.addBinScan(first.lastUpdated, agg);
  scans++;
});
setInterval(() => {
  try { const r = save(); if (r) log(`saved ${file}: ${col.polls} polls, ${r.hours.toFixed(1)} h, ${sales} sales, ${scans} BIN scans, ${(r.bytes / 1e6).toFixed(1)} MB${errors ? `, ${errors} errors` : ""}`); }
  catch (e) { log(`save failed: ${(e as Error).message}`); }
}, 5 * 60_000);

const stop = () => { log("stopping..."); col.flush(); try { const r = save(); if (r) log(`saved ${file}`); } finally { process.exit(0); } };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
log(`collecting as ${NAME} into ${OUT} (bazaar every 20 s, auction sales every 30 s${BINS ? `, lowest BINs every ${BINS_EVERY / 60_000} min (~60 MB each; --no-bins to skip)` : ""})`);
log("upload the finished .json.gz files to the project's GitHub repository, folder data/inbox (see the Contribute page). Ctrl+C to stop.");
