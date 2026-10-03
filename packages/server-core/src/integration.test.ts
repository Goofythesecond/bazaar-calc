// End-to-end check of the SQL and ingestion code against a real Postgres engine (PGlite, in-process).
// Uses live Hypixel endpoints and, if EXPORT_DIR is set, the migration export of the old database.
import { TopTracker } from "@bc/shared";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, bazaarFlips, bookFlips } from "@bc/shared";
import {
  ORIGIN, computeAuctionStats, computeHoldStats, pruneDetail, vacuumHot, computeStats, storeEpisodes, fetchBazaar, fetchElection, ingestBazaar, ingestEndedAuctions, insertMany, ensurePartition,
  loadMarket, loadMayors, migrate, storeElection, type Db,
} from "./index.js";

async function pglite(): Promise<{ db: Db; close: () => Promise<void> }> {
  const pg = await PGlite.create({ parsers: { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) } });
  const query = async (text: string, params?: unknown[]) => {
    if (!params || params.length === 0) {
      const res = await pg.exec(text);
      const last = res.at(-1);
      return { rows: last?.rows ?? [], rowCount: last?.rows.length || last?.affectedRows || 0 };
    }
    const r = await pg.query(text, params);
    return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 }; // same as node-postgres
  };
  const db = { query, connect: async () => ({ query, release() {} }) } as unknown as Db;
  return { db, close: () => pg.close() };
}

const EXPORT = process.env.EXPORT_DIR;

describe("Postgres schema + ingestion (PGlite)", () => {
  it("migrates, ingests live Hypixel data, loads the export, computes stats, and feeds the calculators", async () => {
    const { db, close } = await pglite();
    try {
      expect(await migrate(db)).toEqual(["001_init.sql", "002_kv.sql", "003_flow.sql", "004_top_episodes.sql", "005_npc_shop.sql", "006_utc_partitions.sql"]);

      if (EXPORT && existsSync(join(EXPORT, "manifest.json"))) {
        const read = (name: string) => zlib.zstdDecompressSync(readFileSync(join(EXPORT, `${name}.ndjson.zst`))).toString().split("\n").filter(Boolean).map(l => JSON.parse(l));
        const iso = (t: number) => new Date(t).toISOString();
        await insertMany(db, "items", ["id", "name", "category", "tier", "npc_sell_price", "on_bazaar"], read("items").map(r => [r.id, r.name, r.category, r.tier, r.npc_sell_price, r.on_bazaar]));
        await insertMany(db, "bazaar_snapshots", ["ts", "origin", "n_products", "n_changes", "keyframe"], read("bazaar_snapshots").map(r => [iso(r.ts), r.origin, r.n_products, r.n_changes, r.keyframe]));
        const quotes = read("bazaar_quotes");
        for (const t of new Set(quotes.map(q => new Date(q.ts).toISOString().slice(0, 7)))) {
          await ensurePartition(db, "bazaar_quotes", Date.parse(`${t}-01T00:00:00Z`));
          await ensurePartition(db, "bazaar_books", Date.parse(`${t}-01T00:00:00Z`));
        }
        const n = await insertMany(db, "bazaar_quotes", ["item_id", "ts", "ask_top", "bid_top", "ask_wavg", "bid_wavg", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "origin"],
          quotes.map(q => [q.item_id, iso(q.ts), q.ask_top, q.bid_top, q.ask_wavg, q.bid_wavg, q.ask_volume, q.bid_volume, q.ask_orders, q.bid_orders, q.ibuy_week, q.isell_week, q.origin]));
        expect(n).toBe(quotes.length);
        for (const e of read("election_snapshots")) await storeElection(db, e.data, e.origin);
        const terms = await loadMayors(db);
        expect(terms.length).toBeGreaterThan(5);
        console.log(`export loaded: ${n} quotes, ${terms.length} mayor terms (latest ${terms.at(-1)?.name})`);
      }

      const tracker = new TopTracker();
      const bz = await fetchBazaar();
      const first = await ingestBazaar(db, bz, ORIGIN.POLL, null, tracker);
      expect(first.status).toBe("accepted");
      expect(first.changes).toBeGreaterThan(1000); // first poll is a keyframe
      expect((await ingestBazaar(db, bz, ORIGIN.POLL)).status).toBe("duplicate");
      const latest = await db.query("SELECT count(*)::int AS n FROM bazaar_latest");
      expect(latest.rows[0].n).toBe(Object.keys(bz.products).length);

      // a second, newer poll: the flow table must record the interval between them
      let bz2 = await fetchBazaar();
      for (let i = 0; i < 9 && bz2.lastUpdated === bz.lastUpdated; i++) { await new Promise(r => setTimeout(r, 10_000)); bz2 = await fetchBazaar(); }
      expect((await ingestBazaar(db, bz2, ORIGIN.POLL, null, tracker)).status).toBe("accepted");
      // prices that changed between the polls opened fresh top-of-book episodes; close them and summarise
      await storeEpisodes(db, tracker.flush().map(e => ({ item: "TEST_ITEM", e })));
      // retention: with 0 days of detail, the second (non-keyframe) poll's books go, the hourly keyframe stays
      const before = (await db.query("SELECT count(DISTINCT ts)::int AS n FROM bazaar_books")).rows[0].n;
      const pruned = await pruneDetail(db, 0);
      const after = (await db.query("SELECT count(DISTINCT ts)::int AS n FROM bazaar_books WHERE origin = 1")).rows[0].n;
      expect(before).toBeGreaterThanOrEqual(2);
      expect(pruned.books).toBeGreaterThan(0);
      expect(after).toBe(1);
      expect((await vacuumHot(db)).tables).toBeGreaterThan(0); // VACUUM FULL must run outside a transaction
      const hold = await computeHoldStats(db);
      expect(hold.episodes).toBeGreaterThan(0);
      expect(hold.items).toBeGreaterThan(0);
      const flow = await db.query("SELECT count(*)::int AS n, sum(bid_removed)::bigint AS br, sum(bid_outbid)::int AS ob FROM bazaar_flow_hourly");
      expect(flow.rows[0].n).toBeGreaterThan(1000);
      console.log(`flow: ${flow.rows[0].n} items measured, ${flow.rows[0].br} units left the top buy orders, ${flow.rows[0].ob} outbids in one interval`);

      await storeElection(db, await fetchElection());
      const sales = await ingestEndedAuctions(db);
      await computeAuctionStats(db);
      const statRows = await computeStats(db, 14);
      expect(statRows).toBeGreaterThan(1000);

      const market = await loadMarket(db);
      expect(market.size).toBeGreaterThanOrEqual(Object.keys(bz.products).length);
      const ed = market.get("ENCHANTED_DIAMOND")!;
      expect(ed.ask).toBeCloseTo(bz2.products.ENCHANTED_DIAMOND!.buy_summary[0]!.pricePerUnit, 1);
      expect(ed.bid).toBeCloseTo(bz2.products.ENCHANTED_DIAMOND!.sell_summary[0]!.pricePerUnit, 1);
      expect(ed.topBid!.length).toBeGreaterThan(0);

      const ctx = { market, recipes: new Map(), settings: { ...DEFAULT_SETTINGS, includeFlagged: true }, profile: DEFAULT_PROFILE };
      const flips = bazaarFlips(ctx), books = bookFlips(ctx);
      expect(flips.length).toBeGreaterThan(10);
      console.log(`live: ${Object.keys(bz.products).length} products, ${sales} auction sales, ${statRows} item stats, ${flips.length} bazaar flips, ${books.length} book flips`);
    } finally {
      await close();
    }
  }, 300_000);
});
