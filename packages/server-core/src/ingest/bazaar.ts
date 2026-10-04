// Store one Hypixel bazaar response. Change-only rows + an hourly keyframe; bazaar_latest always holds "now".
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { type BazaarResponse, type BookLevel, type HypixelOrder, type TopEpisode, type TopTracker, bookFlow, counterTrades, degradedBazaar, packLevels, unpackLevels, validateBazaar } from "@bc/shared";
import { type Db, ensurePartition, insertMany } from "../db.js";
import { storeEpisodes } from "../hold.js";

export const ORIGIN = { POLL: 1, CONTRIBUTOR: 2, WAYBACK: 6 } as const;
const cents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
const pack = (orders: HypixelOrder[]) =>
  zlib.zstdCompressSync(Buffer.from(packLevels(orders.map(o => ({ price: o.pricePerUnit, amount: o.amount, orders: o.orders })))));

/** bazaar_flow_hourly columns (db/migrations/003_flow.sql, 007_trades.sql); rows of one item and hour add up. */
export const FLOW_COLUMNS = ["item_id", "hour", "intervals", "seconds", "bid_outbid", "ask_undercut", "bid_removed", "ask_removed", "trade_intervals", "trade_seconds", "bid_trades", "ask_trades"];
export const FLOW_UPSERT = `ON CONFLICT (item_id, hour) DO UPDATE SET ${FLOW_COLUMNS.slice(2).map(c => `${c} = bazaar_flow_hourly.${c} + excluded.${c}`).join(", ")}`;

/** Mark ids ($1, text[]) as sold on the bazaar, adding the ones the item list does not have (name from prettyName). */
export const BAZAAR_ITEMS_UPSERT = "INSERT INTO items (id, on_bazaar) SELECT unnest($1::text[]), true ON CONFLICT (id) DO UPDATE SET on_bazaar = true WHERE NOT items.on_bazaar";

export interface IngestResult { status: "accepted" | "duplicate" | "rejected"; reason?: string; changes?: number; ts?: number }

/** `tracker` (our own polls only) follows the top of every book and records time-on-top episodes. */
export async function ingestBazaar(db: Db, data: BazaarResponse, origin: number, contributorId: number | null = null, tracker?: TopTracker): Promise<IngestResult> {
  const bad = validateBazaar(data);
  if (bad) return { status: "rejected", reason: bad };
  const ts = data.lastUpdated;
  const exists = await db.query("SELECT 1 FROM bazaar_snapshots WHERE ts = $1::timestamptz", [new Date(ts).toISOString()]);
  if (exists.rowCount) return { status: "duplicate", ts };
  const prevCount = Number((await db.query("SELECT n_products FROM bazaar_snapshots WHERE origin = 1 ORDER BY ts DESC LIMIT 1")).rows[0]?.n_products ?? 0);
  const degraded = degradedBazaar(data, prevCount);
  if (degraded) return { status: "rejected", reason: degraded, ts };

  const latest = new Map<string, { ts: number; key: string; bids: Buffer | null; asks: Buffer | null; buyWeek: number; sellWeek: number }>();
  for (const r of (await db.query("SELECT item_id, extract(epoch from ts) * 1000 AS ts, ask_top, bid_top, ask_wavg, bid_wavg, ask_volume, bid_volume, ask_orders, bid_orders, ibuy_week, isell_week, bids, asks, md5(coalesce(bids, ''::bytea) || coalesce(asks, ''::bytea)) AS book FROM bazaar_latest")).rows)
    latest.set(r.item_id, { ts: Number(r.ts), bids: r.bids, asks: r.asks, buyWeek: Number(r.ibuy_week ?? 0), sellWeek: Number(r.isell_week ?? 0), key: [r.ask_top, r.bid_top, r.ask_wavg, r.bid_wavg, r.ask_volume, r.bid_volume, r.ask_orders, r.bid_orders, r.ibuy_week, r.isell_week, r.book].join("|") });
  const lastKey = await db.query("SELECT extract(epoch from max(ts)) * 1000 AS t FROM bazaar_snapshots WHERE keyframe");
  const keyframe = !lastKey.rows[0]?.t || ts - Number(lastKey.rows[0].t) >= 3600_000;
  const newest = Math.max(0, ...[...latest.values()].map(v => v.ts));

  const quoteRows: unknown[][] = [], bookRows: unknown[][] = [], latestRows: unknown[][] = [], flowRows: unknown[][] = [];
  const episodes: { item: string; e: TopEpisode }[] = [];
  const lv = (o: HypixelOrder[]): BookLevel[] => o.map(x => ({ price: x.pricePerUnit, amount: x.amount, orders: x.orders }));
  const hourIso = new Date(ts - (ts % 3600_000)).toISOString();
  const tsIso = new Date(ts).toISOString();
  for (const [id, p] of Object.entries(data.products)) {
    const q = p.quick_status;
    const bids = p.sell_summary ?? [], asks = p.buy_summary ?? []; // Hypixel names sides from the instant-trade view
    const vals = [cents(asks[0]?.pricePerUnit), cents(bids[0]?.pricePerUnit), q.buyOrders ? cents(q.buyPrice) : null, q.sellOrders ? cents(q.sellPrice) : null,
      q.buyVolume, q.sellVolume, q.buyOrders, q.sellOrders, q.buyMovingWeek, q.sellMovingWeek];
    const bidsPacked = pack(bids), asksPacked = pack(asks);
    const bookHash = createHash("md5").update(Buffer.concat([bidsPacked, asksPacked])).digest("hex");
    const changed = latest.get(id)?.key !== [...vals, bookHash].join("|");
    if (keyframe || changed) {
      quoteRows.push([id, tsIso, ...vals, origin]);
      bookRows.push([id, tsIso, bidsPacked, asksPacked, origin]);
    }
    if (ts >= newest) latestRows.push([id, tsIso, ...vals, bidsPacked, asksPacked]);
    if (tracker) for (const e of tracker.step(id, ts, lv(bids), lv(asks))) episodes.push({ item: id, e });
    const prev = latest.get(id);
    if (prev && ts > prev.ts && ts - prev.ts <= 150_000) {
      const f = bookFlow(unbook(prev.bids), unbook(prev.asks), bids, asks);
      const t = counterTrades(prev, { buyWeek: q.buyMovingWeek ?? 0, sellWeek: q.sellMovingWeek ?? 0 });
      flowRows.push([id, hourIso, 1, (ts - prev.ts) / 1000, f.outbid ? 1 : 0, f.undercut ? 1 : 0, Math.round(f.bidRemoved), Math.round(f.askRemoved),
        t ? 1 : 0, t ? (ts - prev.ts) / 1000 : 0, t?.bid ?? 0, t?.ask ?? 0]);
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await ensurePartition(client, "bazaar_quotes", ts);
    await ensurePartition(client, "bazaar_books", ts);
    await insertMany(client, "bazaar_quotes", ["item_id", "ts", "ask_top", "bid_top", "ask_wavg", "bid_wavg", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "origin"], quoteRows);
    await insertMany(client, "bazaar_books", ["item_id", "ts", "bids", "asks", "origin"], bookRows);
    if (latestRows.length)
      await insertMany(client, "bazaar_latest", ["item_id", "ts", "ask_top", "bid_top", "ask_wavg", "bid_wavg", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "bids", "asks"], latestRows,
        "ON CONFLICT (item_id) DO UPDATE SET ts = excluded.ts, ask_top = excluded.ask_top, bid_top = excluded.bid_top, ask_wavg = excluded.ask_wavg, bid_wavg = excluded.bid_wavg, ask_volume = excluded.ask_volume, bid_volume = excluded.bid_volume, ask_orders = excluded.ask_orders, bid_orders = excluded.bid_orders, ibuy_week = excluded.ibuy_week, isell_week = excluded.isell_week, bids = excluded.bids, asks = excluded.asks WHERE bazaar_latest.ts <= excluded.ts");
    if (flowRows.length)
      await insertMany(client, "bazaar_flow_hourly", FLOW_COLUMNS, flowRows, FLOW_UPSERT);
    await storeEpisodes(client, episodes);
    await client.query("INSERT INTO bazaar_snapshots (ts, origin, contributor_id, n_products, n_changes, keyframe) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
      [tsIso, origin, contributorId, Object.keys(data.products).length, quoteRows.length, keyframe]);
    // every bazaar product gets an item row: Hypixel's item list leaves some out (all enchanted books, ENCHANTMENT_*)
    await client.query(BAZAAR_ITEMS_UPSERT, [Object.keys(data.products)]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { status: "accepted", changes: quoteRows.length, ts };
}

const unbook = (b: Buffer | null): BookLevel[] => (b ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(b))) : []);

export { bookFlow };

/** Compare a contributor snapshot with the closest snapshot we already have (top prices of the most traded items). */
export async function crossCheck(db: Db, data: BazaarResponse): Promise<{ compared: number; mismatches: number } | null> {
  const near = await db.query(
    `SELECT DISTINCT ON (q.item_id) q.item_id, q.ask_top, q.bid_top FROM bazaar_quotes q
     WHERE q.ts BETWEEN to_timestamp(($1 - 60000) / 1000.0) AND to_timestamp(($1 + 60000) / 1000.0) AND q.origin = 1
     ORDER BY q.item_id, abs(extract(epoch from q.ts) * 1000 - $1)`, [data.lastUpdated]);
  if (!near.rowCount) return null;
  let compared = 0, mismatches = 0;
  for (const r of near.rows) {
    const p = data.products[r.item_id];
    if (!p || r.ask_top == null || r.bid_top == null) continue;
    compared++;
    const ask = cents(p.buy_summary?.[0]?.pricePerUnit), bid = cents(p.sell_summary?.[0]?.pricePerUnit);
    if (ask == null || bid == null || Math.abs(ask - r.ask_top) / r.ask_top > 0.05 || Math.abs(bid - r.bid_top) / r.bid_top > 0.05) mismatches++;
  }
  return { compared, mismatches };
}
