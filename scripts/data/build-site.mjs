#!/usr/bin/env node
// Build the static website's data from the contribution files in the repository.
//   node scripts/data/build-site.mjs [--data data] [--out site-data] [--offline]
// 1. reads every data file under <data>/contrib and <data>/inbox (bad files are skipped and listed in the manifest)
// 2. imports them into a temporary in-memory database (overlapping contributions are de-duplicated, see contrib.ts)
// 3. syncs recipes (NotEnoughUpdates-REPO), items and the current election (Hypixel) unless --offline
// 4. computes the same statistics the server computes, as of the newest contributed poll
// 5. writes JSON files the website reads: manifest, market statistics, items, recipes, mayors, per-item history and
//    time-on-top episodes, per-key auction data, the scanner's paper-trading record (data/paper/) and, unless --offline,
//    the paper-trading picks the scanner follows (the calculator's best bazaar flips on the live market right now)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import zlib from "node:zlib";
import {
  computeAuctionStats, computeEventImpact, computeHoldStats, computeStats, createPool, importDataFiles, ingestElection, ingestItems, loadMayors,
  migrate, syncNeuRecipes,
} from "@bc/server-core";
import {
  DATA_FILE_RE, DEFAULT_PROFILE, DEFAULT_SETTINGS, HYPIXEL, assembleMarket, buildOpportunities, coverage, currentTerm, decodeDataFile, paperCandidates,
  perkEffects, prettyName, quotesFromBazaar, sanityCheck, siteFileId,
} from "@bc/shared";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DATA = arg("--data", "data"), OUT = arg("--out", "site-data"), OFFLINE = process.argv.includes("--offline");
const H = 3.6e6;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- 1. read files
const found = [];
const walk = dir => { if (!existsSync(dir)) return; for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith(".json.gz")) found.push(p); } };
walk(join(DATA, "contrib")); walk(join(DATA, "inbox"));
const files = [], rejected = [];
for (const p of found) {
  const label = relative(DATA, p);
  try {
    const f = decodeDataFile(zlib.gunzipSync(readFileSync(p)).toString());
    const m = DATA_FILE_RE.exec(p.split("/").pop().replace(/_wayback(?=\.json\.gz$)/, ""));
    if (!m || m[1].toLowerCase() !== f.name.toLowerCase()) throw new Error(`file name must start with the contributor's GitHub login (${f.name}_...)`);
    const { errors, warnings } = sanityCheck(f);
    if (errors.length) throw new Error(errors.join("; "));
    files.push({ label, file: f, warnings });
  } catch (e) { rejected.push({ label, error: e.message }); }
}
log(`${files.length} data files${rejected.length ? `, ${rejected.length} skipped:\n  ` + rejected.map(r => `${r.label}: ${r.error}`).join("\n  ") : ""}`);

// ---- 2. import
const db = createPool("pglite:memory://");
await migrate(db);
const report = await importDataFiles(db, files);
log(`imported ${report.hours} hours of bazaar polls`);

// ---- 3. reference data
let recipesVersion = null;
if (!OFFLINE) {
  const neu = await syncNeuRecipes(db); recipesVersion = neu.commit; log(`recipes: ${neu.recipes} from NEU ${neu.commit.slice(0, 7)}`);
  log(`items: ${await ingestItems(db)}`);
  await ingestElection(db); log("election synced");
}
// every product in the bazaar data is searchable, also the ones Hypixel's item list leaves out (all enchanted books)
await db.query("INSERT INTO items (id, on_bazaar) SELECT DISTINCT item_id, true FROM bazaar_quotes ON CONFLICT (id) DO UPDATE SET on_bazaar = true");

// ---- 4. statistics as of the newest poll
const asOf = Number((await db.query("SELECT extract(epoch from max(ts)) * 1000 AS t FROM bazaar_snapshots WHERE origin = 2")).rows[0]?.t ?? 0)
  || Number((await db.query("SELECT extract(epoch from max(ts)) * 1000 AS t FROM bazaar_snapshots")).rows[0]?.t ?? 0) || Date.now();
log(`statistics as of ${new Date(asOf).toISOString()}`);
await computeStats(db, 14, asOf);
const hold = await computeHoldStats(db, 24, asOf);
await computeAuctionStats(db, asOf);
await computeEventImpact(db, 365, asOf);
log(`hold stats for ${hold.items} item sides from ${hold.episodes} episodes`);

// ---- 5. write
rmSync(OUT, { recursive: true, force: true });
for (const d of ["item", "ah"]) mkdirSync(join(OUT, d), { recursive: true });
const write = (name, v) => writeFileSync(join(OUT, name), JSON.stringify(v));
const q = async (sql, p) => (await db.query(sql, p)).rows;
const at = new Date(asOf).toISOString();

const names = new Map((await q("SELECT id, name FROM items")).map(r => [r.id, r.name]));
const stats = Object.fromEntries((await q("SELECT item_id, data FROM item_stats")).map(r => [r.item_id, r.data]));
const holdStats = {};
for (const r of await q("SELECT item_id, side, data FROM item_hold_stats")) (holdStats[r.item_id] ??= {})[r.side === "b" ? "bid" : "ask"] = r.data;
const ah = Object.fromEntries((await q(`SELECT item_key, extract(epoch from ts) * 1000 AS t, lowest_bin, second_bin, bin_count, auction_count, sales_24h, median_sale_24h FROM ah_latest`))
  .map(r => [r.item_key, { ts: Math.round(Number(r.t)), lowestBin: r.lowest_bin == null ? null : r.lowest_bin / 100, secondBin: r.second_bin == null ? null : r.second_bin / 100,
    bins: r.bin_count, auctions: r.auction_count, sales24h: r.sales_24h ?? 0, medianSale24h: r.median_sale_24h == null ? null : r.median_sale_24h / 100 }]));
const marketIds = new Set([...Object.keys(stats), ...Object.keys(ah)]);
write("market.json", { asOf, stats, hold: holdStats, ah, names: Object.fromEntries([...marketIds].map(id => [id, names.get(id) ?? null])) });

write("items.json", (await q("SELECT id, name, category, tier, on_bazaar, npc_sell_price FROM items ORDER BY on_bazaar DESC, length(id)")).map(r => ({ ...r, name: prettyName(r.id, r.name) })));
write("recipes.json", await q("SELECT output_id, kind, inputs, output_count, duration_s, requirements, requirement_text FROM recipes ORDER BY output_id, kind"));
const election = (await q("SELECT data FROM election_snapshots ORDER BY ts DESC LIMIT 1"))[0]?.data ?? null;
write("mayors.json", { terms: (await loadMayors(db, 0, asOf + 400 * 86400_000)).reverse(), election: election?.current ?? null });

// per item: price history (hourly for 30 days, then one point per 6 hours) and the last day of time-on-top episodes
const series = new Map();
for (const r of await q(`SELECT item_id, extract(epoch from ts) * 1000 AS t, ask_top, bid_top, ask_orders, bid_orders, origin FROM bazaar_quotes ORDER BY item_id, ts`)) {
  let s = series.get(r.item_id); if (!s) series.set(r.item_id, (s = []));
  s.push([Math.round(Number(r.t)), r.ask_top == null ? null : r.ask_top / 100, r.bid_top == null ? null : r.bid_top / 100, r.ask_orders, r.bid_orders, r.origin]);
}
const epsBy = new Map();
for (const r of await q(`SELECT item_id, side, extract(epoch from start_ts) * 1000 AS s, dur_s, polls, flow, end_reason FROM bazaar_top_episodes
    WHERE end_ts >= $1::timestamptz - interval '24 hours' AND end_ts <= $1::timestamptz ORDER BY item_id, side, start_ts`, [at])) {
  let e = epsBy.get(r.item_id); if (!e) epsBy.set(r.item_id, (e = { bid: [], ask: [] }));
  e[r.side === "b" ? "bid" : "ask"].push([Math.round(Number(r.s)), Number(r.dur_s), Number(r.flow), "ogc".indexOf(r.end_reason), Number(r.polls)]);
}
let itemFiles = 0;
for (const id of new Set([...series.keys(), ...epsBy.keys()])) {
  const pts = series.get(id) ?? [], cut = asOf - 30 * 86400_000, kept = [];
  let bin = null;
  for (const p of pts) {
    if (p[0] >= cut) { kept.push(p); continue; }
    const b = Math.floor(p[0] / (6 * H));
    if (bin && bin[0] === b) bin[1] = p; else { if (bin) kept.push(bin[1]); bin = [b, p]; }
  }
  if (bin) kept.push(bin[1]);
  kept.sort((a, b) => a[0] - b[0]);
  write(`item/${siteFileId(id)}.json`, { id, history: { t: kept.map(p => p[0]), ask_top: kept.map(p => p[1]), bid_top: kept.map(p => p[2]), ask_orders: kept.map(p => p[3]), bid_orders: kept.map(p => p[4]), origin: kept.map(p => p[5]) },
    episodes: epsBy.get(id) ?? { bid: [], ask: [] } });
  itemFiles++;
}

// per auction key: hourly lowest BIN (90 days) and the last week's sales (newest 500)
let ahFiles = 0;
const binsBy = new Map(), salesBy = new Map();
for (const r of await q(`SELECT item_key, extract(epoch from date_bin('1 hour', ts, 'epoch')) * 1000 AS t, min(lowest_bin) / 100.0 AS lowest FROM ah_bin_snapshots
    WHERE ts > $1::timestamptz - interval '90 days' GROUP BY 1, 2 ORDER BY 1, 2`, [at])) { let l = binsBy.get(r.item_key); if (!l) binsBy.set(r.item_key, (l = [])); l.push({ t: Number(r.t), lowest: r.lowest == null ? null : Number(r.lowest) }); }
for (const r of await q(`SELECT item_key, extract(epoch from ts) * 1000 AS t, price / 100.0 AS price, bin FROM ah_sales WHERE ts > $1::timestamptz - interval '7 days' ORDER BY item_key, ts DESC`, [at])) {
  let l = salesBy.get(r.item_key); if (!l) salesBy.set(r.item_key, (l = [])); if (l.length < 500) l.push({ t: Number(r.t), price: Number(r.price), bin: r.bin });
}
for (const key of new Set([...Object.keys(ah), ...binsBy.keys(), ...salesBy.keys()])) {
  const a = ah[key];
  write(`ah/${siteFileId(key)}.json`, { key, latest: a ? { item_key: key, ts: new Date(a.ts).toISOString(), lowest_bin: a.lowestBin == null ? null : Math.round(a.lowestBin * 100), second_bin: a.secondBin == null ? null : Math.round(a.secondBin * 100),
    bin_count: a.bins, auction_count: a.auctions, sales_24h: a.sales24h, median_sale_24h: a.medianSale24h == null ? null : Math.round(a.medianSale24h * 100) } : null,
    lowestBinHourly: binsBy.get(key) ?? [], sales: salesBy.get(key) ?? [] });
  ahFiles++;
}

// manifest: what the data covers and who contributed it
const byName = new Map();
for (const [i, f] of report.files.entries()) {
  const src = files[i], c = coverage(src.file);
  // real polling and Internet Archive copies (single snapshots of past days) are counted apart
  const e = byName.get(f.name) ?? { name: f.name, files: 0, hours: 0, polls: 0, last: 0, archiveFiles: 0, archiveSnapshots: 0 };
  if (src.file.collector.source === "wayback") { e.archiveFiles++; e.archiveSnapshots += f.polls; }
  else { e.files++; e.hours += c.hours * (f.hours ? f.picked / f.hours : 0); e.polls += f.polls; e.last = Math.max(e.last, src.file.to); }
  byName.set(f.name, e);
}
const daily = (await q(`SELECT floor(extract(epoch from ts) / 86400) AS d, count(*)::int AS polls FROM bazaar_snapshots WHERE origin = 2 GROUP BY 1 ORDER BY 1`))
  .map(r => ({ day: new Date(Number(r.d) * 86400_000).toISOString().slice(0, 10), polls: r.polls }));
// the always-on scanner's paper trading (packages/collector/src/scanner.ts pushes data/paper/<login>.json with its data)
const paper = [];
if (existsSync(join(DATA, "paper"))) for (const n of readdirSync(join(DATA, "paper")).filter(n => /^[A-Za-z0-9-]{1,39}\.json$/.test(n)).sort()) {
  try { const r = JSON.parse(readFileSync(join(DATA, "paper", n), "utf8")); paper.push({ name: r.name, updatedAt: r.updatedAt, summary: r.summary, state: r.state }); }
  catch (e) { log(`paper record ${n} skipped: ${e.message}`); }
}
if (paper.length) write("paper.json", { records: paper });

// picks for that paper trading: the calculator's best bazaar flips with the default settings, on the live market now,
// built exactly as the website builds its market (statistics as of the newest poll; no "hour ago" when they are older
// than 3 hours). The scanner opens new paper trades only from picks under 2 hours old.
if (!OFFLINE) {
  try {
    const live = await (await fetch(`${HYPIXEL}/skyblock/bazaar`, { signal: AbortSignal.timeout(60_000) })).json();
    const age = live.lastUpdated - asOf, now = Date.now();
    if (age > 7 * 86400_000) throw new Error("the newest data is over 7 days old");
    const statsMap = new Map(Object.entries(stats).map(([k, s]) => [k, age > 3 * H ? { ...s, hourAgo: null } : s]));
    const ahMap = new Map(Object.entries(ah).filter(([, a]) => a.ts > asOf - 2 * H).map(([k, a]) => [k, { lowestBin: a.lowestBin, sales24h: a.sales24h, medianSale24h: a.medianSale24h }]));
    const npcSell = new Map((await q("SELECT id, npc_sell_price FROM items WHERE npc_sell_price IS NOT NULL")).map(r => [r.id, Number(r.npc_sell_price)]));
    const market = assembleMarket({ quotes: quotesFromBazaar(live), stats: statsMap, hold: new Map(Object.entries(holdStats)), ah: ahMap, names, now, npcSell });
    const perks = perkEffects(currentTerm(await loadMayors(db, 0, now + 400 * 86400_000), now));
    const { list } = buildOpportunities({ market, recipes: new Map(), perks, statsAgeH: Math.max(0, age / H) }, "bazaar", DEFAULT_SETTINGS, DEFAULT_PROFILE);
    const candidates = paperCandidates(list).slice(0, 20);
    write("paper-candidates.json", { at: live.lastUpdated, statsAt: asOf, settings: "defaults", quadTaxes: perks.quadTaxes, candidates });
    log(`paper picks: ${candidates.length} (best: ${candidates[0]?.title ?? "none"})`);
  } catch (e) { log(`paper picks not written: ${e.message}`); }
}

// the file list keeps the newest 500 (the scanner adds 48 files a day); the totals cover every file
const fileRows = report.files.map((f, i) => ({ ...f, kind: files[i].file.collector.kind, source: files[i].file.collector.source, from: files[i].file.from, to: files[i].file.to, warnings: files[i].warnings }));
write("manifest.json", {
  format: "bazaar-calc-site/1", builtAt: Date.now(), asOf, recipesVersion,
  contributors: [...byName.values()].sort((a, b) => b.hours - a.hours).map(c => ({ ...c, hours: Math.round(c.hours * 10) / 10 })),
  fileCount: fileRows.length, files: fileRows.sort((a, b) => a.to - b.to).slice(-500),
  paper: paper.map(p => ({ name: p.name, updatedAt: p.updatedAt })),
  rejected, daily, counts: { items: Object.keys(stats).length, holdSides: hold.items, ahKeys: Object.keys(ah).length, itemFiles, ahFiles },
});
log(`wrote ${OUT}: ${itemFiles} item files, ${ahFiles} auction files`);
await db.end();
