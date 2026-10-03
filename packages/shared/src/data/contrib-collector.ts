// Records Hypixel responses into a contribution data file, exactly as the server's scanner processes them
// (ingest/bazaar.ts): same validation, same degraded-snapshot rule, same time-on-top tracker, same book-flow measure.
// Platform independent: the Node collector and the website's browser collector both feed it.
import type { BookLevel } from "../market/index.js";
import { TopTracker } from "../fill/index.js";
import { type BazaarResponse, type ElectionResponse, bookFlow, counterTrades, degradedBazaar, toLevels, validateBazaar } from "./hypixel.js";
import type { BinAgg } from "./nbt.js";
import { type CollectorKind, type DataFile, emptyDataFile } from "./contrib-format.js";

const END = { outbid: 0, gone: 1, cut: 2 } as const;
const MAX_GAP_MS = 150_000;

interface Close { poll: number; ask: number | null; bid: number | null; askVol: number; bidVol: number; askOrders: number; bidOrders: number; buyWeek: number; sellWeek: number }
interface Flow { intervals: number; seconds: number; bidOutbid: number; askUndercut: number; bidRemoved: number; askRemoved: number; tradeIntervals: number; tradeSeconds: number; bidTrades: number; askTrades: number }

const cents = (v: number | undefined | null) => (v == null ? null : Math.round(v * 100));

export class DataCollector {
  private f: DataFile;
  private itemIdx = new Map<string, number>();
  private keyIdx = new Map<string, number>();
  private closes = new Map<string, Close>();           // `${item}|${hour}` -> last poll of that hour
  private flows = new Map<string, Flow>();             // `${item}|${hour}`
  private prev = new Map<string, { ts: number; bids: BookLevel[]; asks: BookLevel[]; buyWeek: number; sellWeek: number }>();
  private tracker = new TopTracker(MAX_GAP_MS);
  private lastPoll = 0;
  private lastProducts = 0;
  private bins = new Map<string, number>();            // `${key}|${hour}` -> row index in ah.bins
  private sales = new Set<string>();
  private lastElection = "";
  private polledMs = 0;
  /** responses refused, with the reason (shown to the person running the collector) */
  rejected: { ts: number; reason: string }[] = [];

  constructor(private name: string, private kind: CollectorKind, private version: string) {
    this.f = emptyDataFile(name, kind, version);
  }

  private item(id: string) { let i = this.itemIdx.get(id); if (i == null) { i = this.f.items.push(id) - 1; this.itemIdx.set(id, i); } return i; }
  private key(k: string) { let i = this.keyIdx.get(k); if (i == null) { i = this.f.ah.keys.push(k) - 1; this.keyIdx.set(k, i); } return i; }
  private span(ts: number) { if (!this.f.from || ts < this.f.from) this.f.from = ts; if (ts > this.f.to) this.f.to = ts; }

  /** One bazaar response. */
  addBazaar(d: BazaarResponse, now = Date.now()): "accepted" | "duplicate" | "rejected" {
    const bad = validateBazaar(d, now) ?? degradedBazaar(d, this.lastProducts);
    if (bad) { this.rejected.push({ ts: d?.lastUpdated ?? now, reason: bad }); return "rejected"; }
    const ts = d.lastUpdated;
    if (ts <= this.lastPoll) return "duplicate";
    const prevPoll = this.f.polls.at(-1);
    if (prevPoll != null && ts - prevPoll <= MAX_GAP_MS) this.polledMs += ts - prevPoll;
    this.lastPoll = ts;
    this.lastProducts = Object.keys(d.products).length;
    const poll = this.f.polls.push(ts) - 1;
    this.span(ts);
    const hour = Math.floor(ts / 3.6e6);
    for (const [id, p] of Object.entries(d.products)) {
      const q = p.quick_status;
      const bidsRaw = p.sell_summary ?? [], asksRaw = p.buy_summary ?? []; // Hypixel names sides from the instant-trade view
      const bids = toLevels(bidsRaw), asks = toLevels(asksRaw);
      const i = this.item(id), ck = `${i}|${hour}`;
      const close: Close = { poll, ask: cents(asksRaw[0]?.pricePerUnit), bid: cents(bidsRaw[0]?.pricePerUnit),
        askVol: q.buyVolume ?? 0, bidVol: q.sellVolume ?? 0, askOrders: q.buyOrders ?? 0, bidOrders: q.sellOrders ?? 0, buyWeek: q.buyMovingWeek ?? 0, sellWeek: q.sellMovingWeek ?? 0 };
      // the hour's close is its last poll with both sides priced (what the statistics use), else its last poll
      const had = this.closes.get(ck);
      if (!had || (close.ask != null && close.bid != null) || had.ask == null || had.bid == null) this.closes.set(ck, close);
      for (const e of this.tracker.step(id, ts, bids, asks)) {
        const ep = this.f.episodes;
        ep.item.push(i); ep.side.push(e.side === "bid" ? 0 : 1); ep.start.push(e.startTs); ep.dur.push(Math.round(e.durS * 10));
        ep.polls.push(e.polls); ep.flow.push(Math.round(e.flow)); ep.end.push(END[e.end]);
      }
      const pr = this.prev.get(id);
      if (pr && ts > pr.ts && ts - pr.ts <= MAX_GAP_MS) {
        const fl = bookFlow(pr.bids, pr.asks, bidsRaw, asksRaw);
        const k = `${i}|${hour}`;
        const r = this.flows.get(k) ?? { intervals: 0, seconds: 0, bidOutbid: 0, askUndercut: 0, bidRemoved: 0, askRemoved: 0, tradeIntervals: 0, tradeSeconds: 0, bidTrades: 0, askTrades: 0 };
        r.intervals++; r.seconds += (ts - pr.ts) / 1000; r.bidOutbid += fl.outbid ? 1 : 0; r.askUndercut += fl.undercut ? 1 : 0;
        r.bidRemoved += Math.round(fl.bidRemoved); r.askRemoved += Math.round(fl.askRemoved);
        const t = counterTrades(pr, { buyWeek: q.buyMovingWeek ?? 0, sellWeek: q.sellMovingWeek ?? 0 });
        if (t) { r.tradeIntervals++; r.tradeSeconds += (ts - pr.ts) / 1000; r.bidTrades += t.bid; r.askTrades += t.ask; }
        this.flows.set(k, r);
      }
      this.prev.set(id, { ts, bids, asks, buyWeek: q.buyMovingWeek ?? 0, sellWeek: q.sellMovingWeek ?? 0 });
    }
    return "accepted";
  }

  /** Anonymous sale prices from the ended-auctions endpoint (already decoded: key, time, coins per item, BIN or not). */
  addSales(list: { key: string; ts: number; price: number; bin: boolean }[]): number {
    let n = 0;
    for (const s of list) {
      const price = Math.round(s.price * 100);
      if (!(price > 0)) continue;
      const id = `${s.key}|${s.ts}|${price}`;
      if (this.sales.has(id)) continue;
      this.sales.add(id);
      const a = this.f.ah.sales;
      a.ts.push(s.ts); a.key.push(this.key(s.key)); a.price.push(price); a.bin.push(s.bin ? 1 : 0);
      this.span(s.ts);
      n++;
    }
    return n;
  }

  /** One complete active-auction scan (lowest BINs per key). The last scan of each hour is kept. */
  addBinScan(ts: number, agg: Map<string, BinAgg>): void {
    const hour = Math.floor(ts / 3.6e6), b = this.f.ah.bins;
    for (const [key, a] of agg) {
      const k = this.key(key), slot = `${k}|${hour}`;
      const row = [ts, k, Number.isFinite(a.lowest) ? Math.round(a.lowest * 100) : null, a.second == null ? null : Math.round(a.second * 100), a.bins, a.total] as const;
      const at = this.bins.get(slot);
      if (at == null) {
        this.bins.set(slot, b.ts.length);
        b.ts.push(row[0]); b.key.push(row[1]); b.lowest.push(row[2]); b.second.push(row[3]); b.bins.push(row[4]); b.total.push(row[5]);
      } else if (b.ts[at]! <= ts) {
        b.ts[at] = row[0]; b.lowest[at] = row[2]; b.second[at] = row[3]; b.bins[at] = row[4]; b.total[at] = row[5];
      }
    }
    this.span(ts);
  }

  addElection(d: ElectionResponse): void {
    if (!d?.success) return;
    const sig = JSON.stringify({ mayor: d.mayor, current: d.current });
    if (sig === this.lastElection) return;
    this.lastElection = sig;
    this.f.election.push(d);
  }

  get polls() { return this.f.polls.length; }
  /** hours of polling in the current file (gaps over 150 s do not count) */
  get hours() { return this.polledMs / 3.6e6; }
  get hasData() { return this.f.polls.length > 0 || this.f.ah.sales.ts.length > 0 || this.f.ah.bins.ts.length > 0; }
  get from() { return this.f.from; }

  /** Everything recorded since the last reset, as a data file (the collector keeps recording). */
  snapshot(): DataFile {
    const f: DataFile = JSON.parse(JSON.stringify(this.f));
    const c = f.closes;
    const rows = [...this.closes].map(([k, v]) => ({ item: Number(k.split("|")[0]), ...v })).sort((a, b) => a.poll - b.poll || a.item - b.item);
    for (const r of rows) {
      c.poll.push(r.poll); c.item.push(r.item); c.ask.push(r.ask); c.bid.push(r.bid); c.askVol.push(r.askVol); c.bidVol.push(r.bidVol);
      c.askOrders.push(r.askOrders); c.bidOrders.push(r.bidOrders); c.buyWeek.push(r.buyWeek); c.sellWeek.push(r.sellWeek);
    }
    const fl = f.flow;
    const frows = [...this.flows].map(([k, v]) => { const [item, hour] = k.split("|").map(Number); return { item: item!, hour: hour!, ...v }; }).sort((a, b) => a.hour - b.hour || a.item - b.item);
    for (const r of frows) {
      fl.hour.push(r.hour); fl.item.push(r.item); fl.intervals.push(r.intervals); fl.seconds.push(Math.round(r.seconds * 10) / 10);
      fl.bidOutbid.push(r.bidOutbid); fl.askUndercut.push(r.askUndercut); fl.bidRemoved.push(r.bidRemoved); fl.askRemoved.push(r.askRemoved);
      fl.tradeIntervals!.push(r.tradeIntervals); fl.tradeSeconds!.push(Math.round(r.tradeSeconds * 10) / 10); fl.bidTrades!.push(r.bidTrades); fl.askTrades!.push(r.askTrades);
    }
    sortColumns(f.episodes as unknown as Record<string, number[]>, (e, i) => [e.item![i]!, e.side![i]!, e.start![i]!]);
    sortColumns(f.ah.bins as unknown as Record<string, number[]>, (e, i) => [e.ts![i]!, e.key![i]!]);
    sortColumns(f.ah.sales as unknown as Record<string, number[]>, (e, i) => [e.ts![i]!, e.key![i]!, e.price![i]!]);
    for (const t of f.episodes.start) if (t < f.from) f.from = t;
    return f;
  }

  /**
   * Start a new file (e.g. at UTC midnight). The tracker and previous books carry on, so time-on-top episodes and
   * flow continue seamlessly across files.
   */
  reset(): void {
    this.f = emptyDataFile(this.name, this.kind, this.version);
    this.polledMs = 0;
    this.itemIdx.clear(); this.keyIdx.clear(); this.closes.clear(); this.flows.clear(); this.bins.clear(); this.sales.clear();
  }

  /** Close every open episode (end of a session) so nothing measured is lost. */
  flush(): void {
    for (const { item, e } of this.tracker.flushItems()) {
      const ep = this.f.episodes, i = this.item(item);
      ep.item.push(i); ep.side.push(e.side === "bid" ? 0 : 1); ep.start.push(e.startTs); ep.dur.push(Math.round(e.durS * 10));
      ep.polls.push(e.polls); ep.flow.push(Math.round(e.flow)); ep.end.push(END[e.end]);
    }
  }
}

/** Sort parallel columns in place by a key. */
function sortColumns(cols: Record<string, number[]>, key: (c: Record<string, number[]>, i: number) => number[]) {
  const names = Object.keys(cols), n = cols[names[0]!]!.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const ka = key(cols, a), kb = key(cols, b);
    for (let j = 0; j < ka.length; j++) if (ka[j] !== kb[j]) return ka[j]! - kb[j]!;
    return 0;
  });
  for (const nm of names) { const src = cols[nm]!; cols[nm] = order.map(i => src[i]!); }
}
