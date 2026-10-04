// Bazaar Calc scanner: the always-on version of the collector, for a small host (a free Node container such as Wispbyte's
// 512 MB plan, or any PC). It records everything the website's history needs, exactly as the server and the collector
// do (bazaar every 20 s with real trades and time on top, ended auctions every 30 s, lowest BINs, the election), and
// every 30 minutes commits the new data straight to the project's GitHub repository, where the publish workflow turns
// it into statistics, outlook and the site. It also runs paper trading around the clock on the few items it trades
// (fill/paper.ts), with the picks the publish workflow computes (site data paper-candidates.json), and pushes that record
// along with the data. No calculator runs here: GitHub does the maths.
//   node bazaar-calc-scanner.mjs [--config scanner.config.json] [--dry-run]
// Setup (token, config, Wispbyte): packages/collector/README.md. Never logs the token.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import zlib from "node:zlib";
import {
  type BazaarResponse, type ItemMarket, type PaperCandidate, type PaperState, DATA_FILE_RE, DataCollector, coverage, dataFileName, encodeDataFile,
  newPaperState, paperStep, paperSummary, sanityCheck, structureErrors,
} from "@bc/shared";
import { GitHubRepo } from "./github.js";
import { startPolling } from "./poll.js";

const VERSION = "scanner-1";
const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);

interface Config {
  name: string; repo: string; branch: string;
  everyMin: number; bins: boolean; binsEveryMin: number;
  site: string; paper: boolean; flipperLevel: number; checkMin: number;
  out: string; keepDays: number; tokenFile: string;
}
const DEFAULTS: Omit<Config, "name"> = {
  repo: "Goofythesecond/bazaar-calc", branch: "main", everyMin: 30, bins: true, binsEveryMin: 30,
  site: "https://goofythesecond.github.io/bazaar-calc/", paper: true, flipperLevel: 0, checkMin: 5,
  out: "scanner-data", keepDays: 2, tokenFile: "github-token.txt",
};
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Bazaar Calc scanner ${VERSION}: records Hypixel market data and pushes it to GitHub every ${DEFAULTS.everyMin} min.
  --config <file>   settings (default scanner.config.json), for example:
                    { "name": "<your GitHub login>" }   everything else has defaults:
                    ${JSON.stringify(DEFAULTS)}
  --dry-run         record and write files, but push nothing
  token: environment variable GITHUB_TOKEN, or the file named by tokenFile (default github-token.txt) next to the config:
         a fine-grained personal access token with "Contents: Read and write" on the repository only`);
  process.exit(0);
}
const CONFIG_PATH = resolve(opt("--config") ?? "scanner.config.json");
let fileCfg: Partial<Config> = {};
try { if (existsSync(CONFIG_PATH)) fileCfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<Config>; }
catch (e) { console.error(`${CONFIG_PATH}: ${(e as Error).message}`); process.exit(2); }
const cfg: Config = { ...DEFAULTS, name: "", ...fileCfg };
if (opt("--name")) cfg.name = opt("--name")!;
if (opt("--every-min")) cfg.everyMin = Number(opt("--every-min"));
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(cfg.name)) {
  console.error(`Put your GitHub login in ${CONFIG_PATH}: { "name": "<login>" }   (see --help)`); process.exit(2);
}
if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) { console.error(`repo must look like owner/name, not ${cfg.repo}`); process.exit(2); }
const DRY = args.includes("--dry-run");
const EVERY = Math.max(1, Math.min(1440, cfg.everyMin)) * 60_000;
const SITE = cfg.site.endsWith("/") ? cfg.site : `${cfg.site}/`;
const OUT = resolve(cfg.out), PENDING = join(OUT, "pending"), SENT = join(OUT, "sent"), REJECTED = join(OUT, "rejected");
for (const d of [PENDING, SENT, REJECTED]) mkdirSync(d, { recursive: true });
const UA = `bazaar-calc-scanner/${VERSION} (open-source SkyBlock market calculator; github.com/${cfg.repo})`;
// a restart starts new files: this tag keeps their names apart from the files the last run pushed
const TAG = Math.random().toString(36).slice(2, 6).padEnd(4, "0");

const readToken = (): string | null => {
  const env = process.env.GITHUB_TOKEN ?? process.env.BC_GITHUB_TOKEN;
  if (env?.trim()) return env.trim();
  const p = resolve(CONFIG_PATH, "..", cfg.tokenFile);
  try { const t = readFileSync(p, "utf8").trim(); return t || null; } catch { return null; }
};
const repoFor = (token: string) => new GitHubRepo(token, cfg.repo, cfg.branch, "https://api.github.com", UA);

// ---- recording: one file per push interval (aligned to the clock, UTC); the collector's tracker carries on across files
const col = new DataCollector(cfg.name, "node", VERSION);
const info = new Map<string, string>(); // file name -> what it covers (for commit messages)
let chunk = Math.floor(Date.now() / EVERY);

function writeAtomic(path: string, data: Uint8Array | string) { writeFileSync(`${path}.tmp`, data); renameSync(`${path}.tmp`, path); }
const memory = () => { const m = process.memoryUsage(); return `memory ${(m.rss / 1e6).toFixed(0)} MB (heap ${(m.heapUsed / 1e6).toFixed(0)}, buffers ${(m.external / 1e6).toFixed(0)})`; };
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16);

/** Close the current file: check it as the publish workflow will, then queue it for the next push. */
function finishChunk(): void {
  if (!col.hasData) return;
  const f = col.snapshot();
  col.reset();
  const start = f.polls[0] ?? f.ah.sales.ts[0] ?? f.from;
  const name = dataFileName({ name: cfg.name, from: start }).replace(/\.json\.gz$/, `_${TAG}.json.gz`);
  const gz = zlib.gzipSync(encodeDataFile(f), { level: 6 }); // level 9 took 4x the CPU (34 vs 8 ms per file, measured 2026-10-04); the content is the same
  const errors = [...structureErrors(f), ...sanityCheck(f).errors];
  if (errors.length) { writeAtomic(join(REJECTED, name), gz); log(`${name} NOT pushed (kept in ${REJECTED}): ${errors.join("; ")}`); return; }
  writeAtomic(join(PENDING, name), gz);
  const c = coverage(f);
  info.set(name, `${hhmm(start)}-${hhmm(f.polls.at(-1) ?? f.to)} UTC: ${c.polls} polls, ${c.sales} sales, ${f.ah.bins.ts.length ? `${new Set(f.ah.bins.ts).size} BIN scans` : "no BIN scan"}`);
  log(`${name}: ${info.get(name)}, ${(gz.length / 1024).toFixed(0)} KB | ${memory()}`);
}

// ---- paper trading (light): only the items it trades and the published picks are followed, with Hypixel's raw book
let paper: PaperState = newPaperState();
const PAPER_FILE = join(OUT, "paper.json");
try { if (existsSync(PAPER_FILE)) paper = JSON.parse(readFileSync(PAPER_FILE, "utf8")) as PaperState; } catch (e) { log(`paper record unreadable, starting over: ${(e as Error).message}`); }
interface Candidates { at: number; quadTaxes: boolean; candidates: PaperCandidate[] }
let picks: Candidates | null = null, picksFetched = 0, picksStale = false;
async function refreshPicks() {
  if (Date.now() - picksFetched < 10 * 60_000) return;
  picksFetched = Date.now();
  try {
    const r = await fetch(`${SITE}data/paper-candidates.json`, { headers: { "user-agent": UA, "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) });
    if (r.ok) picks = (await r.json()) as Candidates; else log(`paper picks: HTTP ${r.status} from ${SITE}data/paper-candidates.json`);
  } catch (e) { log(`paper picks: ${(e as Error).message}`); }
}
const isOpen = (phase: string) => phase === "buying" || phase === "selling";
function paperOn(d: BazaarResponse) {
  void refreshPicks();
  // picks are computed by the publish workflow; older than 2 hours they no longer describe the market: no new trades
  const fresh = picks && d.lastUpdated - picks.at < 2 * 3600_000 ? picks.candidates : [];
  if (picks && !fresh.length && !picksStale) log("paper picks are over 2 hours old: no new paper trades until the site is rebuilt");
  picksStale = !!picks && !fresh.length;
  const ids = new Set([...paper.trades.filter(t => isOpen(t.phase)).map(t => t.item), ...fresh.slice(0, 10).map(c => c.item)]);
  const market = new Map<string, ItemMarket>();
  for (const id of ids) {
    const p = d.products[id];
    if (!p) continue;
    // Hypixel names the sides from the instant-trade view: buy_summary are the sell offers (ask), sell_summary the buy orders (bid)
    market.set(id, { id, name: id, ts: d.lastUpdated, ask: p.buy_summary?.[0]?.pricePerUnit ?? null, bid: p.sell_summary?.[0]?.pricePerUnit ?? null,
      ibuyWeek: p.quick_status.buyMovingWeek ?? 0, isellWeek: p.quick_status.sellMovingWeek ?? 0 } as ItemMarket);
  }
  paper = paperStep(paper, d.lastUpdated, market, () => fresh, { checkMin: cfg.checkMin, flipperLevel: cfg.flipperLevel, quadTaxes: picks?.quadTaxes ?? false });
  writeAtomic(PAPER_FILE, JSON.stringify(paper));
}
const paperRecord = () => JSON.stringify({ name: cfg.name, updatedAt: paper.lastTs, settings: { checkMin: cfg.checkMin, flipperLevel: cfg.flipperLevel },
  summary: paperSummary(paper), state: { trades: paper.trades, lastPick: paper.lastPick, lastTs: paper.lastTs } });

// ---- pushing: every file waiting, plus the paper record, in one commit
let inflight: Promise<void> | null = null, lastErrorAt = 0, warnedNoToken = false;
const status = { startedAt: Date.now(), lastPush: null as null | { at: number; commit: string; files: number }, lastError: null as null | { at: number; message: string } };
function pushPending(): Promise<void> {
  inflight ??= (async () => {
    try {
      for (let round = 0; round < 5; round++) {
        const names = readdirSync(PENDING).filter(n => DATA_FILE_RE.test(n)).sort().slice(0, 48);
        if (!names.length && round > 0) break;
        if (DRY) { if (names.length) log(`dry run: ${names.length} file(s) would be pushed`); break; }
        const token = readToken();
        if (!token) { if (!warnedNoToken) log(`no GitHub token yet (GITHUB_TOKEN or ${cfg.tokenFile}): files wait in ${PENDING}`); warnedNoToken = true; break; }
        warnedNoToken = false;
        const files: { path: string; content: Uint8Array | string }[] = names.map(n => {
          const m = DATA_FILE_RE.exec(n)!;
          const [, login, stamp] = m as unknown as [string, string, string];
          return { path: `data/contrib/${login}/${stamp.slice(0, 4)}-${stamp.slice(4, 6)}/${n}`, content: readFileSync(join(PENDING, n)) };
        });
        if (cfg.paper && paper.lastTs) files.push({ path: `data/paper/${cfg.name}.json`, content: paperRecord() });
        if (!files.length) break;
        const what = names.length === 1 ? info.get(names[0]!) ?? names[0]! : `${names.length} files${names.length ? ` up to ${names.at(-1)}` : ""}`;
        const t0 = Date.now();
        const sha = await repoFor(token).commit(files, `Data from ${cfg.name}'s scanner: ${names.length ? what : "paper trading record"}`);
        for (const n of names) { renameSync(join(PENDING, n), join(SENT, n)); info.delete(n); }
        status.lastPush = { at: Date.now(), commit: sha, files: names.length };
        log(`pushed ${names.length} data file(s)${cfg.paper && paper.lastTs ? " + paper record" : ""} in ${((Date.now() - t0) / 1000).toFixed(1)} s (commit ${sha.slice(0, 7)})`);
        if (names.length < 48) break;
      }
    } catch (e) {
      const message = (e as Error).message;
      status.lastError = { at: Date.now(), message };
      lastErrorAt = Date.now();
      log(`push failed, the files stay queued for the next try: ${message}`);
    } finally {
      prune();
      writeAtomic(join(OUT, "status.json"), JSON.stringify({ ...status, version: VERSION, pending: readdirSync(PENDING).length, rssMB: Math.round(process.memoryUsage().rss / 1e6),
        paper: paperSummary(paper) }, null, 1));
      inflight = null;
    }
  })();
  return inflight;
}
/** Pushed files are kept `keepDays` (to look at); queued ones 30 days at most (the host's disk is small). */
function prune() {
  const now = Date.now();
  for (const [dir, days] of [[SENT, cfg.keepDays], [PENDING, 30]] as const)
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (now - statSync(p).mtimeMs > days * 86400_000) { unlinkSync(p); if (dir === PENDING) log(`deleted ${n}: queued for over 30 days without a successful push`); }
    }
}

// ---- start (paper trading needs its picks first)
if (cfg.paper) await refreshPicks();
const poll = startPolling(col, { ua: UA, bins: cfg.bins, binsEveryMs: Math.max(10, cfg.binsEveryMin) * 60_000, log, afterBazaar: d => { if (cfg.paper) paperOn(d); } });
const tick = setInterval(() => {
  const n = Math.floor(Date.now() / EVERY);
  if (n !== chunk) { chunk = n; finishChunk(); void pushPending(); }
  else if (lastErrorAt && Date.now() - lastErrorAt > 5 * 60_000 && readdirSync(PENDING).length) { lastErrorAt = 0; void pushPending(); } // retry after a failure
}, 5_000);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  log("stopping: saving and pushing what was recorded...");
  clearInterval(tick); poll.stop(); col.flush(); finishChunk();
  await Promise.race([pushPending(), new Promise(r => setTimeout(r, 25_000))]);
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

log(`scanner ${VERSION} as ${cfg.name}: bazaar every 20 s, auction sales every 30 s${cfg.bins ? `, lowest BINs every ${cfg.binsEveryMin} min` : ""}; pushing to ${cfg.repo} (${cfg.branch}) every ${EVERY / 60_000} min${DRY ? " (dry run: nothing is pushed)" : ""}; paper trading ${cfg.paper ? "on" : "off"}; files in ${OUT}`);
if (!DRY) {
  const token = readToken();
  if (!token) log(`no GitHub token yet: put it in ${resolve(CONFIG_PATH, "..", cfg.tokenFile)} or GITHUB_TOKEN (recording goes on; files wait until then)`);
  // files left from the last run go out now; otherwise the first push is at the next file (no commit of the paper record alone)
  else void repoFor(token).checkWrite().then(() => { log(`GitHub: ${cfg.repo} writable with this token`); return readdirSync(PENDING).length ? pushPending() : undefined; },
    e => log(`GitHub check failed (recording goes on; pushes retry): ${(e as Error).message}`));
}
