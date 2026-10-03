#!/usr/bin/env node
// Same-outputs check for refactors: records every public output of @bc/shared on frozen inputs, so two runs (before and
// after a change) can be compared byte for byte. See "Refactoring without changing behaviour" in docs/ARCHITECTURE.md.
//   node scripts/checks/outputs.mjs --freeze <dir> --site-data <site-data dir>   save inputs: 3 bazaar polls 20 s apart,
//                                                                                ended auctions, one auction page, site data
//   node scripts/checks/outputs.mjs <dir> <out.json>                             record outputs (build @bc/shared first)
// Records: the market, every calculator at 3 settings x 2 profiles (with and without auction outputs), the planner,
// fill reports, events and outlook, requirements, rules, Hypixel helpers, the collector + data file format, the fill
// model, and the list of public exports.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import zlib from "node:zlib";
import * as S from "@bc/shared";

if (process.argv[2] === "--freeze") {
  const dir = process.argv[3], i = process.argv.indexOf("--site-data"), sd = i > 0 ? process.argv[i + 1] : null;
  if (!dir || !sd) { console.error("usage: outputs.mjs --freeze <dir> --site-data <site-data dir>"); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  const get = async u => { const r = await fetch(`https://api.hypixel.net/v2/skyblock/${u}`); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.text(); };
  for (const n of [1, 2, 3]) { writeFileSync(`${dir}/bz${n}.json`, await get("bazaar")); if (n < 3) await new Promise(r => setTimeout(r, 21_000)); }
  writeFileSync(`${dir}/ended.json`, await get("auctions_ended"));
  writeFileSync(`${dir}/ah0.json`, await get("auctions?page=0"));
  cpSync(sd, `${dir}/site-data`, { recursive: true });
  console.log(`inputs saved in ${dir}`);
  process.exit(0);
}
const [dir, outFile] = process.argv.slice(2);
if (!dir || !outFile) { console.error("usage: outputs.mjs <frozen dir> <out.json>   (or --freeze, see the top of this file)"); process.exit(2); }
const j = p => JSON.parse(readFileSync(`${dir}/${p}`, "utf8"));


const bz = [j("bz1.json"), j("bz2.json"), j("bz3.json")];
// the clock is taken from the frozen data (a minute after its last poll): outputs stay comparable, and the collector
// accepts the polls (a fixed date once made newer inputs look like they came from the future, so nothing was recorded)
const NOW = bz[2].lastUpdated + 60_000;
const sd = "site-data";
const base = j(`${sd}/market.json`), recipeRows = j(`${sd}/recipes.json`), mayors = j(`${sd}/mayors.json`);
const recipes = new Map();
for (const r of recipeRows) { const rec = { outputId: r.output_id, kind: r.kind, inputs: r.inputs, outputCount: Number(r.output_count), durationS: r.duration_s ?? undefined, requirements: r.requirements, ...(r.kind === "npc" ? { source: r.requirement_text ?? undefined } : {}) }; recipes.set(rec.outputId, [...(recipes.get(rec.outputId) ?? []), rec]); }
const out = {};
const put = (k, v) => { out[k] = JSON.stringify(v, (_, x) => (x instanceof Map ? [...x] : typeof x === "number" && !Number.isFinite(x) ? String(x) : x)); };

// market
const ah = new Map(Object.entries(base.ah).filter(([, a]) => a.ts > base.asOf - 2 * 3600e3).map(([k, a]) => [k, { lowestBin: a.lowestBin, sales24h: a.sales24h, medianSale24h: a.medianSale24h }]));
const market = S.assembleMarket({ quotes: S.quotesFromBazaar(bz[2]), stats: new Map(Object.entries(base.stats)), hold: new Map(Object.entries(base.hold)), ah, names: new Map(Object.entries(base.names)), now: NOW });
put("market", [...market.entries()]);
const src = { market, recipes, perks: S.NO_PERKS };
const build = (kind, st, pr, ahf, all) => S.buildOpportunities(src, kind, st, pr, ahf, all);
const settingsList = [{}, { coins: 1e9, bazaarFlipperLevel: 2, checkIntervalMin: 2 }, { coins: 5e6, hoursPerDay: 12, dailyLimit: 2e9 }];
const profiles = [{}, { ignoreRequirements: false, hotmTier: 7, collections: { Diamond: 9 } }];
for (const [si, st] of settingsList.entries()) for (const [pi, pr] of profiles.entries()) {
  for (const kind of ["bazaar", "craft", "book", "forge", "all"]) for (const ahf of [false, true])
    put(`calc:${kind}:${si}:${pi}:${ahf}`, S.calcResponse(build, kind, { settings: st, profile: pr, filters: { limit: 500, includeAhForge: ahf } }, { marketAt: NOW, dataAt: NOW }));
  put(`plan:${si}:${pi}`, S.planResponse(build, { settings: st, profile: pr }, { marketAt: NOW, dataAt: NOW }));
}
// fill reports from the published episodes
for (const id of ["ENCHANTED_DIAMOND", "BOOSTER_COOKIE", "ENCHANTMENT_ULTIMATE_LEGION_1", "SHARD_SHELLWISE", "MITHRIL_INFUSION", "ENCHANTED_GOLD_BLOCK"]) {
  const f = j(`${sd}/item/${S.siteFileId(id)}.json`);
  const eps = side => (f.episodes[side] ?? []).map(([start, dur, flow, end, polls]) => ({ side, price: 0, startTs: start, endTs: start + dur * 1000, durS: dur, loS: dur, hiS: dur, polls, flow, removedAtPrice: 0, startAmount: 0, startOrders: 0, end: ["outbid", "gone", "cut"][end] }));
  put(`fill:${id}`, await S.fillReport(market.get(id), { check: 5, qty: 1000, unknownShare: 0.5 }, side => eps(side), NOW));
}
// events, outlook, requirements, rules
const events = [...S.calendarEvents(NOW - 400 * 86400e3, NOW + 14 * 86400e3), ...S.realtimeEvents(NOW - 400 * 86400e3, NOW + 14 * 86400e3), ...S.mayorEvents(mayors.terms)].sort((a, b) => a.start - b.start);
put("events", events);
const impacts = new Map(Object.entries(base.stats).filter(([, s]) => Array.isArray(s.eventImpact)).map(([k, s]) => [k, s.eventImpact]));
put("outlook", S.outlookResponse(events, mayors.election, impacts, market, { days: 14 }, NOW));
put("requirements", S.requirementsCatalog([...recipes.values()].flat()));
put("rules", { bazaar: S.BAZAAR, forge: S.FORGE, slots: [0, 1, 2].map(S.orderSlots), tax: [0, 1, 2].map(S.taxRate), forgeSlots: Array.from({ length: 11 }, (_, i) => S.forgeSlots(i)), qf: Array.from({ length: 21 }, (_, i) => S.quickForgeReduction(i)),
  timing: S.timingTable({ pingMs: 80, clickDelayMs: 350, typingMs: 1500 }), reset: S.msUntilLimitReset(NOW), enchants: S.enchantRules(), names: ["ENCHANTMENT_SHARPNESS_5", "PET_BEE_LEGENDARY", "INK_SACK:3", "SHARD_BONZO"].map(id => S.prettyName(id)),
  books: ["ENCHANTMENT_SHARPNESS_5", "ENCHANTMENT_ULTIMATE_LEGION_1", "DIAMOND"].map(S.parseBookId), neu: ["SHARPNESS;6", "BEE;4", "ENCHANTED_DIAMOND", "LOG-1"].map(S.neuToHypixelId), limit: [1e6, 3e9].map(S.limitContribution) });
// Hypixel helpers
put("hypixel", { valid: S.validateBazaar(bz[0], NOW), degraded: S.degradedBazaar(bz[0], 2197), flow: Object.keys(bz[0].products).slice(0, 300).map(id => S.bookFlow(S.toLevels(bz[0].products[id].sell_summary), S.toLevels(bz[0].products[id].buy_summary), bz[1].products[id]?.sell_summary ?? [], bz[1].products[id]?.buy_summary ?? [])) });
// collector + data file format
const col = new S.DataCollector("Baseline", "node", "test-1");
for (const d of bz) col.addBazaar(d, NOW);
const ended = j("ended.json");
col.addSales(ended.auctions.map(a => { const k = S.auctionItemKey(new Uint8Array(zlib.gunzipSync(Buffer.from(a.item_bytes, "base64")))); return k && { key: k.key, ts: a.timestamp, price: a.price / k.count, bin: a.bin }; }).filter(Boolean));
col.addBinScan(j("ah0.json").lastUpdated, await S.aggregateBins(j("ah0.json").auctions, b => S.auctionItemKey(new Uint8Array(zlib.gunzipSync(Buffer.from(b, "base64"))))));
col.flush();
const file = col.snapshot(), text = S.encodeDataFile(file);
put("datafile", { text, roundtrip: S.encodeDataFile(S.decodeDataFile(text)) === text, sanity: S.sanityCheck(file, NOW), coverage: S.coverage(file), name: S.dataFileName(file), re: S.DATA_FILE_RE.test(S.dataFileName(file)) });
// time on top from the frozen polls
const tr = new S.TopTracker(); const eps = [];
for (const d of bz) for (const [id, p] of Object.entries(d.products)) eps.push(...tr.step(id, d.lastUpdated, S.toLevels(p.sell_summary), S.toLevels(p.buy_summary)));
eps.push(...tr.flush());
put("toptrack", { n: eps.length, summary: S.summarizeTop(eps, 1), survival: S.survival(eps).slice(0, 50), quota: S.quotaTime(eps.filter(e => e.durS > 0), 100, 5) });
// sizing
const hs = base.hold.ENCHANTED_DIAMOND?.bid;
const model = S.fillModel(hs, 5000, 10, 5, 0.5);
put("sizing", { grid: S.SIZE_GRID, curve: S.curve(model, 5), at: S.at(S.curve(model, 5), 1234), size: S.sizeFor(S.curve(model, 5), 500, 71680), est: S.curve(S.fillModel(null, 200, 4, 5, 0.5), 5) });
put("exports", Object.keys(S).sort());

const hashes = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, createHash("sha256").update(v).digest("hex").slice(0, 16)]));
writeFileSync(outFile, JSON.stringify({ hashes, out }));
console.log(`${Object.keys(out).length} outputs recorded, ${(JSON.stringify(out).length / 1e6).toFixed(1)} MB`);
