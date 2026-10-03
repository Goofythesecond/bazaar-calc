#!/usr/bin/env node
// Build packages/shared/test-data/fixture.json from the old sbdb live polls (Hypixel data) + a NEU repo checkout.
// node scripts/make-fixture.mjs --sbdb ../data/skyblock.db --neu /path/to/NotEnoughUpdates-REPO
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { parseNeuItem, unpackLevels } from "../packages/shared/dist/index.js";

const arg = k => process.argv[process.argv.indexOf(k) + 1];
const db = new DatabaseSync(arg("--sbdb"), { readOnly: true });
const lastTs = db.prepare("SELECT max(ts) AS t FROM live_fetches WHERE source_id = 1").get().t;
const since = lastTs - 6 * 3600e3;
const span = db.prepare("SELECT min(ts) AS a, max(ts) AS b FROM live_fetches WHERE source_id = 1 AND ts >= ?").get(since);
const liveHours = (span.b - span.a) / 3600e3;
const rows = db.prepare(`SELECT i.tag, i.name, q.* FROM quotes q JOIN (SELECT item_id, max(ts) AS ts FROM quotes WHERE source_id = 1 GROUP BY item_id) m USING (item_id, ts)
  JOIN items i USING (item_id) WHERE q.source_id = 1`).all();
const und = new Map(db.prepare(`SELECT item_id, sum(bid_top > pb) AS ub, sum(ask_top < pa) AS us FROM (SELECT item_id, bid_top, ask_top, lag(bid_top) OVER w AS pb, lag(ask_top) OVER w AS pa
  FROM quotes WHERE source_id = 1 AND ts >= ? WINDOW w AS (PARTITION BY item_id ORDER BY ts)) GROUP BY item_id`).all(since).map(r => [r.item_id, r]));
const books = new Map(db.prepare(`SELECT b.item_id, b.bids, b.asks FROM books b JOIN (SELECT item_id, max(ts) AS ts FROM books WHERE source_id = 1 GROUP BY item_id) m USING (item_id, ts) WHERE b.source_id = 1`).all().map(r => [r.item_id, r]));
const unpack = blob => blob ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(Buffer.from(blob)))).slice(0, 10) : [];
const market = rows.map(r => {
  const u = und.get(r.item_id) ?? { ub: 0, us: 0 }, b = books.get(r.item_id);
  return { id: r.tag, name: r.name ?? r.tag, ts: r.ts, ask: r.ask_top ? r.ask_top / 100 : null, bid: r.bid_top ? r.bid_top / 100 : null,
    askVolume: r.ask_volume ?? 0, bidVolume: r.bid_volume ?? 0, askOrders: r.ask_orders ?? 0, bidOrders: r.bid_orders ?? 0,
    ibuyWeek: r.ibuy_week ?? 0, isellWeek: r.isell_week ?? 0, undercutBuyH: liveHours ? u.ub / liveHours : null, undercutSellH: liveHours ? u.us / liveHours : null,
    liveHours, topBid: b ? unpack(b.bids) : [], topAsk: b ? unpack(b.asks) : [], flags: [], flagWhy: {} };
});
const recipes = [];
const dir = join(arg("--neu"), "items");
for (const f of readdirSync(dir)) {
  try { recipes.push(...parseNeuItem(JSON.parse(readFileSync(join(dir, f), "utf8")))); } catch {}
}
mkdirSync("packages/shared/test-data", { recursive: true });
writeFileSync("packages/shared/test-data/fixture.json", JSON.stringify({ generated: new Date().toISOString(), source: "sbdb live Hypixel polls + NEU repo", liveHours, market, recipes }));
console.log(`fixture: ${market.length} items, ${recipes.length} recipes, ${liveHours.toFixed(1)} h of live data`);
