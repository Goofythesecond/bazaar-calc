// Contribution data files (packages/shared/src/contrib/format.ts) into the database, and the database back into files.
//
// Several contributors can record the same hours. Bazaar data is taken per (file, UTC hour): the stretches of polling
// with the most polls are picked first and a stretch that overlaps an already picked one in the same hour is skipped,
// so nothing is counted twice and complementary stretches (one person polled the first half of an hour, another the
// second half) are both used. Auction sales are de-duplicated by item, time and price.
import { createHash } from "node:crypto";
import { type DataFile, type ElectionResponse, emptyDataFile } from "@bc/shared";
import { type Db, ensurePartition, insertMany } from "./db.js";
import { storeElection } from "./ingest/reference.js";

const H = 3.6e6;
const END = ["o", "g", "c"] as const;

export interface ImportReport {
  files: { label: string; name: string; hours: number; picked: number; polls: number; closes: number; flow: number; episodes: number; sales: number; bins: number }[];
  hours: number;
}

interface Stretch { file: number; hour: number; first: number; last: number; n: number }

/** Index of the last poll <= t (polls ascending), -1 if none. */
function lastAtOrBefore(polls: number[], t: number): number {
  let lo = 0, hi = polls.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (polls[m]! <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

/**
 * Import decoded files. `skipCovered`: leave out hours the database already has bazaar polls for (a self-hosted server
 * keeps its own data and only fills gaps); importing the same files twice then adds nothing.
 */
export async function importDataFiles(db: Db, files: { label: string; file: DataFile }[], opts: { skipCovered?: boolean } = {}): Promise<ImportReport> {
  // stretches of polling per file and UTC hour
  const stretches: Stretch[] = [];
  files.forEach(({ file }, fi) => {
    let cur: Stretch | null = null;
    for (const t of file.polls) {
      const hour = Math.floor(t / H);
      if (!cur || cur.hour !== hour) { cur = { file: fi, hour, first: t, last: t, n: 0 }; stretches.push(cur); }
      cur.last = t; cur.n++;
    }
  });
  const taken = new Map<number, [number, number][]>(); // hour -> picked [first, last]
  // what the database already recorded (whole hours around the files): its stretches of polling per hour
  const own: [number, number][] = [];
  if (opts.skipCovered) {
    const times = files.flatMap(({ file }) => [file.from, file.to]);
    const lo = Math.floor(Math.min(...times) / H) * H, hi = (Math.floor(Math.max(...times) / H) + 1) * H;
    const have = await db.query(
      `SELECT floor(extract(epoch from ts) * 1000 / 3600000) AS h, min(extract(epoch from ts) * 1000) AS a, max(extract(epoch from ts) * 1000) AS b
         FROM bazaar_snapshots WHERE ts >= to_timestamp($1 / 1000.0) AND ts < to_timestamp($2 / 1000.0) GROUP BY 1`, [lo, hi]);
    for (const r of have.rows) { taken.set(Number(r.h), [[Number(r.a), Number(r.b)]]); own.push([Number(r.a), Number(r.b)]); }
  }
  // auction sales the database's own scanner was already polling for (ended auctions are polled alongside the bazaar)
  const covered = (t: number) => own.some(([a, b]) => t >= a - 60_000 && t <= b + 60_000);
  // more polls first; on a tie the maintainer's own export, then the older file name (stable)
  const order = stretches.map((s, i) => i).sort((a, b) => stretches[b]!.n - stretches[a]!.n
    || Number(files[stretches[b]!.file]!.file.collector.kind === "export") - Number(files[stretches[a]!.file]!.file.collector.kind === "export")
    || files[stretches[a]!.file]!.label.localeCompare(files[stretches[b]!.file]!.label));
  const picked = files.map(() => new Set<number>());
  for (const i of order) {
    const s = stretches[i]!, list = taken.get(s.hour) ?? [];
    if (list.some(([a, b]) => s.first <= b && s.last >= a)) continue;
    list.push([s.first, s.last]); taken.set(s.hour, list);
    picked[s.file]!.add(s.hour);
  }

  const report: ImportReport = { files: [], hours: new Set(stretches.filter(s => picked[s.file]!.has(s.hour)).map(s => s.hour)).size };
  for (const [fi, { label, file: f }] of files.entries()) {
    const ok = picked[fi]!;
    const origin = f.collector.source === "wayback" ? 6 : 2;
    const iso = (t: number) => new Date(t).toISOString();
    const inHour = (t: number) => ok.has(Math.floor(t / H));
    const months = new Set<number>();
    const snaps = f.polls.filter(inHour);
    for (const t of snaps) months.add(Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), 1));
    for (const m of months) { await ensurePartition(db, "bazaar_quotes", m); await ensurePartition(db, "bazaar_books", m); }
    await insertMany(db, "bazaar_snapshots", ["ts", "origin", "n_products", "n_changes", "keyframe"], snaps.map(t => [iso(t), origin, null, null, false]));
    const c = f.closes, quotes: unknown[][] = [];
    for (let i = 0; i < c.item.length; i++) {
      const t = f.polls[c.poll[i]!]!;
      if (!inHour(t)) continue;
      quotes.push([f.items[c.item[i]!], iso(t), c.ask[i], c.bid[i], c.askVol[i], c.bidVol[i], c.askOrders[i], c.bidOrders[i], c.buyWeek[i], c.sellWeek[i], origin]);
    }
    await insertMany(db, "bazaar_quotes", ["item_id", "ts", "ask_top", "bid_top", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "origin"], quotes);
    const fl = f.flow, flows: unknown[][] = [];
    for (let i = 0; i < fl.item.length; i++) {
      if (!ok.has(fl.hour[i]!)) continue;
      flows.push([f.items[fl.item[i]!], iso(fl.hour[i]! * H), fl.intervals[i], fl.seconds[i], fl.bidOutbid[i], fl.askUndercut[i], fl.bidRemoved[i], fl.askRemoved[i]]);
    }
    await insertMany(db, "bazaar_flow_hourly", ["item_id", "hour", "intervals", "seconds", "bid_outbid", "ask_undercut", "bid_removed", "ask_removed"], flows,
      "ON CONFLICT (item_id, hour) DO UPDATE SET intervals = bazaar_flow_hourly.intervals + excluded.intervals, seconds = bazaar_flow_hourly.seconds + excluded.seconds, bid_outbid = bazaar_flow_hourly.bid_outbid + excluded.bid_outbid, ask_undercut = bazaar_flow_hourly.ask_undercut + excluded.ask_undercut, bid_removed = bazaar_flow_hourly.bid_removed + excluded.bid_removed, ask_removed = bazaar_flow_hourly.ask_removed + excluded.ask_removed");
    // an episode belongs to the stretch that recorded its end: the file's last poll at or before start + duration
    const e = f.episodes, eps: unknown[][] = [];
    for (let i = 0; i < e.item.length; i++) {
      // with regular polls start + midpoint duration lands on the poll that ended the episode (or, for a cut one, about
      // half a gap after its last poll): the end is that poll
      const p = lastAtOrBefore(f.polls, e.start[i]! + e.dur[i]! * 100 + 1000);
      if (p < 0 || !ok.has(Math.floor(f.polls[p]! / H))) continue;
      const d = e.dur[i]! / 10;
      eps.push([f.items[e.item[i]!], e.side[i] === 0 ? "b" : "a", iso(e.start[i]!), iso(Math.max(e.start[i]!, f.polls[p]!)), 0, d, d, d, e.polls[i], e.flow[i], 0, 0, 0, END[e.end[i]!]]);
    }
    await insertMany(db, "bazaar_top_episodes",
      ["item_id", "side", "start_ts", "end_ts", "price_cents", "dur_s", "lo_s", "hi_s", "polls", "flow", "removed", "start_amount", "start_orders", "end_reason"], eps);
    // auctions: every file contributes; the same sale seen by two people has the same item, time and price
    const s = f.ah.sales, sales: unknown[][] = [];
    for (let i = 0; i < s.ts.length; i++) {
      if (covered(s.ts[i]!)) continue;
      const key = f.ah.keys[s.key[i]!]!;
      const h = createHash("md5").update(`${key}|${s.ts[i]}|${s.price[i]}`).digest("hex");
      sales.push([`${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, key, iso(s.ts[i]!), s.price[i], s.bin[i] === 1, origin]);
    }
    for (const t of new Set(s.ts.map(t => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), 1)))) await ensurePartition(db, "ah_sales", t);
    const nSales = await insertMany(db, "ah_sales", ["auction_id", "item_key", "ts", "price", "bin", "origin"], sales);
    const b = f.ah.bins, bins: unknown[][] = [];
    for (let i = 0; i < b.ts.length; i++) bins.push([f.ah.keys[b.key[i]!], iso(b.ts[i]!), b.lowest[i], b.second[i], b.bins[i], b.total[i], origin]);
    for (const t of new Set(b.ts.map(t => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), 1)))) await ensurePartition(db, "ah_bin_snapshots", t);
    await insertMany(db, "ah_bin_snapshots", ["item_key", "ts", "lowest_bin", "second_bin", "bin_count", "auction_count", "origin"], bins);
    const latest = new Map<string, unknown[]>();
    for (const r of bins) { const prev = latest.get(r[0] as string); if (!prev || (prev[1] as string) < (r[1] as string)) latest.set(r[0] as string, r); }
    await insertMany(db, "ah_latest", ["item_key", "ts", "lowest_bin", "second_bin", "bin_count", "auction_count"], [...latest.values()].map(r => r.slice(0, 6)),
      "ON CONFLICT (item_key) DO UPDATE SET ts = excluded.ts, lowest_bin = excluded.lowest_bin, second_bin = excluded.second_bin, bin_count = excluded.bin_count, auction_count = excluded.auction_count WHERE ah_latest.ts <= excluded.ts");
    for (const el of f.election) await storeElection(db, el as ElectionResponse, origin);
    report.files.push({ label, name: f.name, hours: new Set(f.polls.map(t => Math.floor(t / H))).size, picked: ok.size, polls: snaps.length,
      closes: quotes.length, flow: flows.length, episodes: eps.length, sales: nSales, bins: bins.length });
  }
  return report;
}

/**
 * Export the database's own bazaar polls (origin 1), Internet Archive copies (origin 6) and auction data as data files,
 * one per UTC day and source. Only what still exists is exported (order books are thinned after a few days and
 * time-on-top episodes are kept for three days).
 */
export async function exportDataFiles(db: Db, name: string, version: string, opts: { from?: number; to?: number } = {}): Promise<DataFile[]> {
  const from = opts.from ?? 0, to = opts.to ?? Date.now();
  const out: DataFile[] = [];
  const days = (await db.query(
    `SELECT DISTINCT floor(extract(epoch from ts) / 86400) AS d, origin FROM bazaar_snapshots
      WHERE origin IN (1, 6) AND ts BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0) ORDER BY 1, 2`, [from, to])).rows;
  const ahDays = (await db.query(
    `SELECT DISTINCT floor(extract(epoch from ts) / 86400) AS d FROM ah_sales WHERE origin = 1 AND ts BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)
     UNION SELECT DISTINCT floor(extract(epoch from ts) / 86400) FROM ah_bin_snapshots WHERE origin = 1 AND ts BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)`, [from, to])).rows;
  const elDays = (await db.query(
    `SELECT DISTINCT floor(extract(epoch from ts) / 86400) AS d, origin FROM election_snapshots WHERE origin IN (1, 6) AND ts BETWEEN to_timestamp($1 / 1000.0) AND to_timestamp($2 / 1000.0)`, [from, to])).rows;
  const keys = new Map<string, { day: number; origin: number }>();
  for (const r of [...days, ...elDays]) keys.set(`${r.d}|${r.origin}`, { day: Number(r.d), origin: Number(r.origin) });
  for (const r of ahDays) if (!keys.has(`${r.d}|6`)) keys.set(`${r.d}|1`, { day: Number(r.d), origin: 1 });
  for (const { day, origin } of [...keys.values()].sort((a, b) => a.day - b.day || a.origin - b.origin)) {
    const a = Math.max(from, day * 86400_000), b = Math.min(to, (day + 1) * 86400_000 - 1);
    const f = emptyDataFile(name, "export", version, origin === 6 ? "wayback" : "poll");
    const range = [new Date(a).toISOString(), new Date(b).toISOString()];
    f.polls = (await db.query(`SELECT extract(epoch from ts) * 1000 AS t FROM bazaar_snapshots WHERE origin = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts`, [origin, ...range])).rows.map(r => Math.round(Number(r.t)));
    const pollIdx = new Map(f.polls.map((t, i) => [t, i]));
    const items = new Map<string, number>(), item = (id: string) => { let i = items.get(id); if (i == null) { i = f.items.push(id) - 1; items.set(id, i); } return i; };
    // close of each hour: the item's newest stored quote in that hour (quotes are stored when something changed, and
    // at least hourly), at the hour's last poll (nothing changed after the stored row)
    const lastPoll = new Map<number, number>();
    for (const [i, t] of f.polls.entries()) lastPoll.set(Math.floor(t / H), i);
    // Like the statistics, a close prefers the hour's last quote with BOTH sides priced: when the newest row of the hour
    // is one-sided (a side ran empty), the last two-sided row is used, at its own time.
    const q = await db.query(
      `SELECT DISTINCT ON (item_id, floor(extract(epoch from ts) / 3600)) item_id, extract(epoch from ts) * 1000 AS t, ask_top, bid_top, ask_volume, bid_volume, ask_orders, bid_orders, ibuy_week, isell_week,
              ts = max(ts) OVER (PARTITION BY item_id, floor(extract(epoch from ts) / 3600)) AS newest
         FROM bazaar_quotes WHERE origin = $1 AND ts BETWEEN $2 AND $3
        ORDER BY item_id, floor(extract(epoch from ts) / 3600), (ask_top IS NOT NULL AND bid_top IS NOT NULL) DESC, ts DESC`, [origin, ...range]);
    const rows = q.rows.map(r => ({ r, p: origin === 6 || !r.newest ? pollIdx.get(Math.round(Number(r.t))) : lastPoll.get(Math.floor(Number(r.t) / H)) }))
      .filter(x => x.p != null).sort((x, y) => x.p! - y.p! || String(x.r.item_id).localeCompare(String(y.r.item_id)));
    for (const { r, p } of rows) {
      const c = f.closes;
      c.poll.push(p!); c.item.push(item(r.item_id)); c.ask.push(r.ask_top == null ? null : Number(r.ask_top)); c.bid.push(r.bid_top == null ? null : Number(r.bid_top));
      c.askVol.push(Number(r.ask_volume ?? 0)); c.bidVol.push(Number(r.bid_volume ?? 0)); c.askOrders.push(Number(r.ask_orders ?? 0)); c.bidOrders.push(Number(r.bid_orders ?? 0));
      c.buyWeek.push(Number(r.ibuy_week ?? 0)); c.sellWeek.push(Number(r.isell_week ?? 0));
    }
    if (origin === 1) {
      for (const r of (await db.query(`SELECT item_id, extract(epoch from hour) * 1000 AS h, intervals, seconds, bid_outbid, ask_undercut, bid_removed, ask_removed
          FROM bazaar_flow_hourly WHERE hour BETWEEN $1 AND $2 ORDER BY hour, item_id`, range)).rows) {
        const fl = f.flow;
        fl.hour.push(Math.round(Number(r.h) / H)); fl.item.push(item(r.item_id)); fl.intervals.push(Number(r.intervals)); fl.seconds.push(Math.round(Number(r.seconds) * 10) / 10);
        fl.bidOutbid.push(Number(r.bid_outbid)); fl.askUndercut.push(Number(r.ask_undercut)); fl.bidRemoved.push(Number(r.bid_removed)); fl.askRemoved.push(Number(r.ask_removed));
      }
      for (const r of (await db.query(`SELECT item_id, side, extract(epoch from start_ts) * 1000 AS s, dur_s, polls, flow, end_reason FROM bazaar_top_episodes
          WHERE end_ts BETWEEN $1 AND $2 ORDER BY item_id, side, start_ts`, range)).rows) {
        const e = f.episodes;
        e.item.push(item(r.item_id)); e.side.push(r.side === "b" ? 0 : 1); e.start.push(Math.round(Number(r.s))); e.dur.push(Math.round(Number(r.dur_s) * 10));
        e.polls.push(Number(r.polls)); e.flow.push(Math.round(Number(r.flow))); e.end.push(END.indexOf(r.end_reason));
      }
      const ks = new Map<string, number>(), key = (k: string) => { let i = ks.get(k); if (i == null) { i = f.ah.keys.push(k) - 1; ks.set(k, i); } return i; };
      for (const r of (await db.query(`SELECT item_key, extract(epoch from ts) * 1000 AS t, price, bin FROM ah_sales WHERE origin = 1 AND ts BETWEEN $1 AND $2 ORDER BY ts, item_key, price`, range)).rows) {
        f.ah.sales.ts.push(Math.round(Number(r.t))); f.ah.sales.key.push(key(r.item_key)); f.ah.sales.price.push(Number(r.price)); f.ah.sales.bin.push(r.bin ? 1 : 0);
      }
      for (const r of (await db.query(`SELECT DISTINCT ON (item_key, floor(extract(epoch from ts) / 3600)) item_key, extract(epoch from ts) * 1000 AS t, lowest_bin, second_bin, bin_count, auction_count
          FROM ah_bin_snapshots WHERE origin = 1 AND ts BETWEEN $1 AND $2 ORDER BY item_key, floor(extract(epoch from ts) / 3600), ts DESC`, range)).rows
        .sort((x, y) => Number(x.t) - Number(y.t) || String(x.item_key).localeCompare(String(y.item_key)))) {
        const b = f.ah.bins;
        b.ts.push(Math.round(Number(r.t))); b.key.push(key(r.item_key)); b.lowest.push(r.lowest_bin == null ? null : Number(r.lowest_bin));
        b.second.push(r.second_bin == null ? null : Number(r.second_bin)); b.bins.push(Number(r.bin_count)); b.total.push(Number(r.auction_count));
      }
    }
    // mayor / election responses (Internet Archive copies go with the archive files)
    let last = "";
    for (const r of (await db.query(`SELECT data FROM election_snapshots WHERE origin = $1 AND ts BETWEEN $2 AND $3 ORDER BY ts`, [origin, ...range])).rows) {
      const sig = JSON.stringify({ mayor: r.data?.mayor, current: r.data?.current });
      if (sig !== last && r.data?.success) { f.election.push(r.data); last = sig; }
    }
    let lo = Infinity, hi = -Infinity;
    for (const xs of [f.polls, f.ah.sales.ts, f.ah.bins.ts, f.episodes.start, f.flow.hour.map(h => h * H), f.election.map(e => e.lastUpdated)]) for (const t of xs) { if (t < lo) lo = t; if (t > hi) hi = t; }
    if (!Number.isFinite(lo)) continue;
    f.from = lo; f.to = hi;
    out.push(f);
  }
  return out;
}
