// Time-on-top episodes: recorded while polling, summarised per item every few minutes, served to the calculator.
import zlib from "node:zlib";
import { type BookLevel, type HoldStats, type TopEpisode, TopTracker, summarizeTop, unpackLevels } from "@bc/shared";
import { type Db, insertMany } from "./db.js";

const END = { outbid: "o", gone: "g", cut: "c" } as const;
const END_BACK: Record<string, TopEpisode["end"]> = { o: "outbid", g: "gone", c: "cut" };
export const HOLD_WINDOW_HOURS = 24;
export const EPISODE_RETENTION_DAYS = 3;

export async function storeEpisodes(db: Parameters<typeof insertMany>[0], items: { item: string; e: TopEpisode }[]): Promise<void> {
  if (!items.length) return;
  await insertMany(db, "bazaar_top_episodes",
    ["item_id", "side", "start_ts", "end_ts", "price_cents", "dur_s", "lo_s", "hi_s", "polls", "flow", "removed", "start_amount", "start_orders", "end_reason"],
    items.map(({ item, e }) => [item, e.side === "bid" ? "b" : "a", new Date(e.startTs).toISOString(), new Date(e.endTs).toISOString(), Math.round(e.price * 100),
      e.durS, e.loS, e.hiS, e.polls, Math.round(e.flow), Math.round(e.removedAtPrice), Math.round(e.startAmount), e.startOrders, END[e.end]]));
}

const rowToEpisode = (r: Record<string, unknown>): TopEpisode => ({
  side: r.side === "b" ? "bid" : "ask", price: Number(r.price_cents) / 100, startTs: Number(r.start_ms), endTs: Number(r.end_ms),
  durS: Number(r.dur_s), loS: Number(r.lo_s), hiS: Number(r.hi_s), polls: Number(r.polls), flow: Number(r.flow), removedAtPrice: Number(r.removed),
  startAmount: Number(r.start_amount), startOrders: Number(r.start_orders), end: END_BACK[String(r.end_reason)] ?? "cut",
});

/** Episodes of one item and side, oldest first. */
export async function loadEpisodes(db: Db, item: string, side: "bid" | "ask", hours = HOLD_WINDOW_HOURS): Promise<TopEpisode[]> {
  const res = await db.query(
    `SELECT side, price_cents, extract(epoch from start_ts) * 1000 AS start_ms, extract(epoch from end_ts) * 1000 AS end_ms, dur_s, lo_s, hi_s, polls, flow, removed, start_amount, start_orders, end_reason
       FROM bazaar_top_episodes WHERE item_id = $1 AND side = $2 AND end_ts >= now() - make_interval(hours => $3) ORDER BY start_ts`,
    [item, side === "bid" ? "b" : "a", hours]);
  return res.rows.map(rowToEpisode);
}

/** Hours of live polling inside the window (gaps over 150 s do not count). */
async function polledHours(db: Db, hours: number, at: string): Promise<number> {
  const res = await db.query(
    `SELECT coalesce(sum(least(gap, 150)), 0) / 3600 AS h FROM (
       SELECT extract(epoch from ts - lag(ts) OVER (ORDER BY ts)) AS gap FROM bazaar_snapshots
        WHERE origin IN (1, 2) AND ts >= $2::timestamptz - make_interval(hours => $1) AND ts <= $2::timestamptz) x WHERE gap IS NOT NULL AND gap <= 150`, [hours, at]);
  return Number(res.rows[0]?.h ?? 0);
}

/** Summarise the last day of episodes per item and side into item_hold_stats; drop old episodes. `now`: the moment the
 *  summary describes (the website build uses the newest contributed data). */
export async function computeHoldStats(db: Db, hours = HOLD_WINDOW_HOURS, now = Date.now()): Promise<{ items: number; episodes: number; pruned: number }> {
  const at = new Date(now).toISOString();
  const res = await db.query(
    `SELECT item_id, side, price_cents, extract(epoch from start_ts) * 1000 AS start_ms, extract(epoch from end_ts) * 1000 AS end_ms, dur_s, lo_s, hi_s, polls, flow, removed, start_amount, start_orders, end_reason
       FROM bazaar_top_episodes WHERE end_ts >= $2::timestamptz - make_interval(hours => $1) AND end_ts <= $2::timestamptz ORDER BY item_id, side, start_ts`, [hours, at]);
  const span = await polledHours(db, hours, at);
  const groups = new Map<string, TopEpisode[]>();
  for (const r of res.rows) {
    const k = `${r.item_id}|${r.side}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(rowToEpisode(r));
  }
  const rows: unknown[][] = [];
  const iso = new Date().toISOString();
  for (const [k, eps] of groups) {
    const s = summarizeTop(eps, span);
    if (!s) continue;
    const [item, side] = k.split("|");
    rows.push([item, side, iso, JSON.stringify(s)]);
  }
  await insertMany(db, "item_hold_stats", ["item_id", "side", "computed_at", "data"], rows,
    "ON CONFLICT (item_id, side) DO UPDATE SET computed_at = excluded.computed_at, data = excluded.data");
  // items that no longer had any episode in the window lose their (stale) summary
  await db.query("DELETE FROM item_hold_stats WHERE computed_at < $1::timestamptz", [iso]);
  const pruned = await db.query("DELETE FROM bazaar_top_episodes WHERE end_ts < $2::timestamptz - make_interval(days => $1)", [EPISODE_RETENTION_DAYS, at]);
  return { items: rows.length, episodes: res.rows.length, pruned: pruned.rowCount ?? 0 };
}

export async function loadHoldStats(db: Db): Promise<Map<string, { bid?: HoldStats; ask?: HoldStats }>> {
  const res = await db.query("SELECT item_id, side, data FROM item_hold_stats");
  const out = new Map<string, { bid?: HoldStats; ask?: HoldStats }>();
  for (const r of res.rows) {
    const e = out.get(r.item_id) ?? {};
    e[r.side === "b" ? "bid" : "ask"] = r.data as HoldStats;
    out.set(r.item_id, e);
  }
  return out;
}

const unbook = (b: Buffer | Uint8Array | null): BookLevel[] => (b ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(Buffer.from(b)))) : []);

/**
 * Rebuild episodes from stored order books (first run, or after the table was emptied). Books are stored only when
 * they change, so an item without a row at a poll still has its previous book.
 */
export async function backfillEpisodes(db: Db, hours = HOLD_WINDOW_HOURS): Promise<{ polls: number; episodes: number }> {
  const have = await db.query("SELECT 1 FROM bazaar_top_episodes LIMIT 1");
  if (have.rowCount) return { polls: 0, episodes: 0 };
  const snaps = (await db.query(
    "SELECT extract(epoch from ts) * 1000 AS t, ts FROM bazaar_snapshots WHERE origin = 1 AND ts >= now() - make_interval(hours => $1) ORDER BY ts", [hours])).rows;
  const tracker = new TopTracker();
  const cur = new Map<string, { bids: BookLevel[]; asks: BookLevel[] }>();
  // seed with each item's last book before the window
  if (snaps.length) {
    const seed = await db.query(
      `SELECT DISTINCT ON (item_id) item_id, bids, asks FROM bazaar_books WHERE ts <= $1 AND origin = 1 AND ts > $1::timestamptz - interval '2 hours' ORDER BY item_id, ts DESC`, [snaps[0]!.ts]);
    for (const r of seed.rows) cur.set(r.item_id, { bids: unbook(r.bids), asks: unbook(r.asks) });
  }
  let n = 0;
  for (const s of snaps) {
    const rows = (await db.query("SELECT item_id, bids, asks FROM bazaar_books WHERE ts = $1 AND origin = 1", [s.ts])).rows;
    for (const r of rows) cur.set(r.item_id, { bids: unbook(r.bids), asks: unbook(r.asks) });
    const out: { item: string; e: TopEpisode }[] = [];
    for (const [id, b] of cur) for (const e of tracker.step(id, Number(s.t), b.bids, b.asks)) out.push({ item: id, e });
    await storeEpisodes(db, out);
    n += out.length;
  }
  return { polls: snaps.length, episodes: n };
}
