// Periodic statistics per bazaar item: reference medians (calc window, default 14 days), competition (undercuts per
// hour over the last 6 h), price an hour ago, 14-day sparkline, changes, volatility; and (daily) event impact.
import { type EventImpact, eventImpact } from "@bc/shared";
import type { Db } from "./db.js";
import { insertMany } from "./db.js";
import { loadEvents, type ItemStats } from "./market.js";

/** Undercuts per hour with a Poisson correction: polls only show WHETHER the top changed in an interval, so with a share p
 *  of intervals showing a change the true rate is -ln(1 - p) per interval. Measured flows are units removed from the top
 *  levels per hour (an upper bound on fills, since cancels look the same). */
export function competition(c: { n: unknown; secs: unknown; ob: unknown; uc: unknown; br: unknown; ar: unknown } | undefined) {
  const n = Number(c?.n ?? 0), secs = Number(c?.secs ?? 0);
  if (!c || n < 15 || secs <= 0) return { undercutBuyH: null, undercutSellH: null, observedBuyFlowH: null, observedSellFlowH: null };
  const per = secs / n, rate = (k: number) => (k <= 0 ? 0 : -Math.log(1 - Math.min(0.99, k / n)) * (3600 / per));
  return { undercutBuyH: rate(Number(c.ob)), undercutSellH: rate(Number(c.uc)), observedBuyFlowH: Number(c.br) / (secs / 3600), observedSellFlowH: Number(c.ar) / (secs / 3600) };
}

/** Units that left each side of the book vs real instant trades over the same watched hours (null when too little data). */
export function delists(c: { secs: unknown; br: unknown; ar: unknown } | undefined, k: { span: unknown; b1: unknown; b2: unknown; s1: unknown; s2: unknown } | undefined) {
  const span = Number(k?.span ?? 0), watched = Number(c?.secs ?? 0) / 3600;
  if (!c || !k || span < 3 || watched < 3) return null;
  // The counter's drop-off (trades from exactly a week earlier) is unknown and swings with last week's activity; to never
  // call real trading a "delist", trades are taken as at least the item's average weekly rate over the same hours.
  const trades = (w1: number, w2: number) => Math.max((w2 - w1 + (w1 / 168) * span) * (watched / span), (Math.max(w1, w2) / 168) * watched);
  return { hours: watched,
    bidRemoved: Number(c.br), bidTrades: trades(Number(k.s1), Number(k.s2)),   // buy orders are hit by instant SELLS
    askRemoved: Number(c.ar), askTrades: trades(Number(k.b1), Number(k.b2)) }; // sell offers are hit by instant BUYS
}

/** `now`: the moment the statistics describe (the website build uses the newest contributed data, not the clock). */
export async function computeStats(db: Db, windowDays = 14, now = Date.now()): Promise<number> {
  const at = new Date(now).toISOString();
  const closes = await db.query(
    `SELECT DISTINCT ON (item_id, b) item_id, extract(epoch from b) * 1000 AS b, ask_top, bid_top, ask_volume, bid_volume
       FROM (SELECT item_id, date_bin('1 hour', ts, 'epoch') AS b, ts, ask_top, bid_top, ask_volume, bid_volume FROM bazaar_quotes
             WHERE ts >= $2::timestamptz - make_interval(days => $1) AND ts <= $2::timestamptz AND ask_top IS NOT NULL AND bid_top IS NOT NULL) x
      ORDER BY item_id, b, ts DESC`, [windowDays, at]);
  // competition + measured flow from consecutive order books (bazaar_flow_hourly), last 24 hours
  const comp = await db.query(
    `SELECT item_id, sum(intervals) AS n, sum(seconds) AS secs, sum(bid_outbid) AS ob, sum(ask_undercut) AS uc, sum(bid_removed) AS br, sum(ask_removed) AS ar
       FROM bazaar_flow_hourly WHERE hour >= date_trunc('hour', $1::timestamptz - interval '24 hours') AND hour <= $1::timestamptz GROUP BY item_id`, [at]);
  // real instant trades in the same 24 h: rise of Hypixel's 7-day counters (first -> last quote) plus what dropped off
  // from a week earlier (estimated at the average weekly rate). Compared with units that left the book, this separates
  // trades from cancellations (mass delists / spoofed walls).
  const counters = new Map((await db.query(
    `WITH w AS (SELECT item_id, ts, ibuy_week, isell_week FROM bazaar_quotes WHERE ts >= $1::timestamptz - interval '24 hours' AND ts <= $1::timestamptz AND origin IN (1, 2)),
          f AS (SELECT DISTINCT ON (item_id) * FROM w ORDER BY item_id, ts),
          l AS (SELECT DISTINCT ON (item_id) * FROM w ORDER BY item_id, ts DESC)
     SELECT f.item_id, extract(epoch from l.ts - f.ts) / 3600 AS span, f.ibuy_week AS b1, l.ibuy_week AS b2, f.isell_week AS s1, l.isell_week AS s2 FROM f JOIN l USING (item_id)`, [at])).rows.map(r => [r.item_id, r]));
  const hourAgo = await db.query(
    `SELECT DISTINCT ON (item_id) item_id, ask_top, bid_top FROM bazaar_quotes
      WHERE ts BETWEEN $1::timestamptz - interval '3 hours' AND $1::timestamptz - interval '1 hour' ORDER BY item_id, ts DESC`, [at]);
  const compBy = new Map(comp.rows.map(r => [r.item_id, r]));
  const agoBy = new Map(hourAgo.rows.map(r => [r.item_id, r]));
  const series = new Map<string, { b: number; ask: number; bid: number; askVol: number; bidVol: number }[]>();
  for (const r of closes.rows) {
    const list = series.get(r.item_id) ?? [];
    list.push({ b: Number(r.b), ask: r.ask_top / 100, bid: r.bid_top / 100, askVol: Number(r.ask_volume ?? 0), bidVol: Number(r.bid_volume ?? 0) });
    series.set(r.item_id, list);
  }
  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2) : null; };
  const rows: unknown[][] = [];
  const iso = new Date(now).toISOString();
  const old = new Map((await db.query("SELECT item_id, data FROM item_stats")).rows.map(r => [r.item_id, r.data]));
  for (const [id, pts] of series) {
    const mids = pts.map(p => ({ t: p.b, v: (p.ask + p.bid) / 2 }));
    const at = (t: number) => { let best = null as null | { t: number; v: number }; for (const p of mids) if (Math.abs(p.t - t) < 3 * 3600_000 && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p; return best?.v ?? null; };
    const last = mids.at(-1)!.v;
    const step = (windowDays * 86400_000) / 42, start = now - windowDays * 86400_000;
    const spark: (number | null)[] = Array(42).fill(null);
    for (const p of mids) { const i = Math.floor((p.t - start) / step); if (i >= 0 && i < 42) spark[i] = p.v; }
    const rets: number[] = [];
    for (let i = 1; i < mids.length; i++) if (mids[i]!.t - mids[i - 1]!.t <= 3600_000 * 1.5) rets.push(Math.log(mids[i]!.v / mids[i - 1]!.v));
    const sd = rets.length > 10 ? Math.sqrt(rets.reduce((a, r) => a + r * r, 0) / rets.length - (rets.reduce((a, r) => a + r, 0) / rets.length) ** 2) : null;
    const c = compBy.get(id), ago = agoBy.get(id);
    const ref = (v: number | null) => (v != null && v !== last ? last / v - 1 : null);
    // typical levels from history: medians of hourly closes in the last 24 h and 7 days, with how many hours back them
    const win = (h: number) => pts.filter(p => p.b >= now - h * 3600_000);
    const w24 = win(24), w7 = win(24 * 7);
    const data: ItemStats & { eventImpact?: EventImpact[] } = {
      askMed: med(pts.map(p => p.ask)), bidMed: med(pts.map(p => p.bid)), spreadMed: med(pts.map(p => (p.ask - p.bid) / p.bid)), days: windowDays,
      ...competition(c), liveHours: c ? Number(c.secs) / 3600 : 0,
      delists: delists(c, counters.get(id)),
      hourAgo: ago ? { ask: ago.ask_top / 100, bid: ago.bid_top / 100 } : null,
      spark, chg24: ref(at(now - 86400_000)), chg7: ref(at(now - 7 * 86400_000)), chg14: ref(mids[0]!.t < start + 12 * 3600_000 ? mids[0]!.v : null),
      volDaily: sd != null ? sd * Math.sqrt(24) : null,
      ask24: med(w24.map(p => p.ask)), bid24: med(w24.map(p => p.bid)), n24: w24.length,
      ask7: med(w7.map(p => p.ask)), bid7: med(w7.map(p => p.bid)), n7: w7.length,
      askVol24: med(w24.map(p => p.askVol)), bidVol24: med(w24.map(p => p.bidVol)),
      eventImpact: old.get(id)?.eventImpact,
    };
    rows.push([id, iso, windowDays, JSON.stringify(data)]);
  }
  await insertMany(db, "item_stats", ["item_id", "computed_at", "window_days", "data"], rows,
    "ON CONFLICT (item_id) DO UPDATE SET computed_at = excluded.computed_at, window_days = excluded.window_days, data = excluded.data");
  return rows.length;
}

/** Auction sale counts and median per-item price over the last 24 h (from anonymous sale records). */
export async function computeAuctionStats(db: Db, now = Date.now()): Promise<number> {
  const res = await db.query(
    `UPDATE ah_latest l SET sales_24h = x.n, median_sale_24h = x.med
       FROM (SELECT item_key, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::bigint AS med
               FROM ah_sales WHERE ts >= $1::timestamptz - interval '24 hours' AND ts <= $1::timestamptz GROUP BY item_key) x
      WHERE l.item_key = x.item_key`, [new Date(now).toISOString()]);
  return res.rowCount ?? 0;
}

/** Daily: per item, measure mid-price moves during past events (all stored history, 2-hour closes). */
export async function computeEventImpact(db: Db, lookbackDays = 365, now = Date.now()): Promise<number> {
  const from = now - lookbackDays * 86400_000;
  const events = (await loadEvents(db, from, now)).filter(e => e.end < now);
  const ids = (await db.query("SELECT item_id FROM item_stats")).rows.map(r => r.item_id as string);
  let n = 0;
  for (const id of ids) {
    const res = await db.query(
      `SELECT DISTINCT ON (b) extract(epoch from b) * 1000 AS t, (ask_top + bid_top) / 200.0 AS v
         FROM (SELECT date_bin('2 hours', ts, 'epoch') AS b, ts, ask_top, bid_top FROM bazaar_quotes
               WHERE item_id = $1 AND ts >= to_timestamp($2 / 1000.0) AND ask_top IS NOT NULL AND bid_top IS NOT NULL) x
        ORDER BY b, ts DESC`, [id, from]);
    const points = res.rows.map(r => ({ t: Number(r.t), v: Number(r.v) }));
    if (points.length < 50) continue;
    const impact = eventImpact(points, events);
    await db.query("UPDATE item_stats SET data = jsonb_set(data, '{eventImpact}', $2::jsonb) WHERE item_id = $1", [id, JSON.stringify(impact)]);
    n++;
  }
  return n;
}
