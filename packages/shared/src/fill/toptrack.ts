// Top-of-book episodes: how long a freshly posted best price stays best, and how many units trade against it.
//
// An episode starts when a poll shows a NEW best price that beats the previous best (somebody posted an order one step
// better, which is exactly what a flipper does). It ends when a later poll shows a better price ("outbid"), or the level
// is gone and the best price got worse ("gone": filled or cancelled; polls cannot tell which). If the poll stream has a
// gap the episode is cut (right-censored) so it still counts for survival, but never with an invented end.
//
// Polls are ~20 s apart (60 s before 2026-10-02), so durations are interval-censored: the order appeared somewhere between the poll before the
// start and the start poll, and was beaten somewhere between its last poll on top and the next one. We use the midpoint
// estimate and keep both bounds.
import type { BookLevel, HoldStats } from "../market/index.js";
import { MIN_MEASURED_EPISODES } from "./sizing.js";

export type Side = "bid" | "ask";
export type EpisodeEnd = "outbid" | "gone" | "cut";

export interface TopEpisode {
  side: Side;
  price: number;
  startTs: number;
  endTs: number;
  /** midpoint estimate of seconds on top, with interval-censoring bounds */
  durS: number;
  loS: number;
  hiS: number;
  /** polls that showed this price on top */
  polls: number;
  /** units that left the book at prices this order would have been ahead of, while it was on top */
  flow: number;
  /** units removed at exactly this price (fills or cancels); the first poster is first in the queue */
  removedAtPrice: number;
  startAmount: number;
  startOrders: number;
  end: EpisodeEnd;
}

interface Open { price: number; startTs: number; prevTs: number; lastTs: number; polls: number; flow: number; removed: number; startAmount: number; startOrders: number; fresh: boolean }

const key = (p: number) => Math.round(p * 100);
const better = (side: Side, a: number, b: number) => (side === "bid" ? a > b + 1e-9 : a < b - 1e-9);
/** Units at one price (key) in a book side. A scan of at most 30 levels: building a lookup map per item and poll was the
 *  scanner's biggest CPU cost (2026-10-04 profile) and gives the same answer. */
const amountAt = (levels: BookLevel[], k: number) => { for (const l of levels) if (key(l.price) === k) return l.amount; return 0; };

/** Follows the top of both sides of many items across consecutive polls. Feed every poll in time order. */
export class TopTracker {
  private open = new Map<string, Open>();
  private last = new Map<string, { ts: number; bids: BookLevel[]; asks: BookLevel[] }>();
  constructor(private maxGapMs = 150_000) {}

  /** One poll of one item. Returns the episodes that finished at this poll. */
  step(item: string, ts: number, bids: BookLevel[], asks: BookLevel[]): TopEpisode[] {
    const prev = this.last.get(item);
    if (prev && ts <= prev.ts) return [];
    this.last.set(item, { ts, bids, asks });
    const out: TopEpisode[] = [];
    const continuous = prev != null && ts - prev.ts <= this.maxGapMs;
    for (const side of ["bid", "ask"] as const) {
      const k = `${item}|${side}`;
      const cur = side === "bid" ? bids : asks;
      const st = this.open.get(k);
      if (!continuous) {
        if (st?.fresh) out.push(close(side, st, st.lastTs, "cut"));
        this.open.delete(k);
        if (cur[0]) this.open.set(k, start(cur[0], ts, ts, false));
        continue;
      }
      const before = side === "bid" ? prev.bids : prev.asks;
      const top = cur[0];
      if (st) {
        const sk = key(st.price);
        const removedHere = Math.max(0, amountAt(before, sk) - amountAt(cur, sk));
        let flow = removedHere;
        if (!top || better(side, st.price, top.price)) {
          // our level emptied and the best got worse: everything consumed down to the new best passed through our price first
          flow = 0;
          for (const l of before) if (!top || !better(side, top.price, l.price)) flow += Math.max(0, l.amount - amountAt(cur, key(l.price)));
        }
        st.removed += removedHere;
        st.flow += flow;
        if (top && key(top.price) === key(st.price)) { st.polls++; st.lastTs = ts; continue; }
        if (st.fresh) out.push(close(side, st, ts, top && better(side, top.price, st.price) ? "outbid" : "gone"));
        this.open.delete(k);
        if (top) this.open.set(k, start(top, ts, prev.ts, better(side, top.price, st.price)));
      } else if (top) {
        const oldTop = before[0];
        this.open.set(k, start(top, ts, prev.ts, !oldTop || better(side, top.price, oldTop.price)));
      }
    }
    return out;
  }

  /** Close everything still open (end of a replay). */
  flush(): TopEpisode[] {
    return this.flushItems().map(x => x.e);
  }
  /** Like flush(), with the item of each episode. */
  flushItems(): { item: string; e: TopEpisode }[] {
    const out: { item: string; e: TopEpisode }[] = [];
    for (const [k, st] of this.open) if (st.fresh) out.push({ item: k.slice(0, k.lastIndexOf("|")), e: close(k.endsWith("|bid") ? "bid" : "ask", st, st.lastTs, "cut") });
    this.open.clear();
    return out;
  }
}

function start(top: BookLevel, ts: number, prevTs: number, fresh: boolean): Open {
  return { price: top.price, startTs: ts, prevTs, lastTs: ts, polls: 1, flow: 0, removed: 0, startAmount: top.amount, startOrders: top.orders, fresh };
}

function close(side: Side, st: Open, endTs: number, end: EpisodeEnd): TopEpisode {
  const loS = (st.lastTs - st.startTs) / 1000;
  const hiS = (end === "cut" ? st.lastTs - st.prevTs : endTs - st.prevTs) / 1000;
  const durS = end === "cut" ? loS + (st.startTs - st.prevTs) / 2000 : (loS + hiS) / 2;
  return { side, price: st.price, startTs: st.startTs, endTs, durS, loS, hiS, polls: st.polls, flow: st.flow, removedAtPrice: st.removed, startAmount: st.startAmount, startOrders: st.startOrders, end };
}

// ---- summaries -------------------------------------------------------------------------------------------------

const QS = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];

export type TopSummary = HoldStats;
const MAX_SAMPLES = 64;

/** Kaplan-Meier survival of time on top, with right censoring for cut episodes. */
export function survival(eps: { durS: number; end: EpisodeEnd }[]): { t: number; s: number }[] {
  const sorted = [...eps].sort((a, b) => a.durS - b.durS);
  let atRisk = sorted.length, s = 1;
  const out: { t: number; s: number }[] = [{ t: 0, s: 1 }];
  for (let i = 0; i < sorted.length;) {
    const t = sorted[i]!.durS;
    let d = 0, c = 0;
    while (i < sorted.length && sorted[i]!.durS === t) { if (sorted[i]!.end === "cut") c++; else d++; i++; }
    if (d > 0) { s *= 1 - d / atRisk; out.push({ t, s }); }
    atRisk -= d + c;
  }
  return out;
}

const kmQuantile = (km: { t: number; s: number }[], q: number) => km.find(p => p.s <= 1 - q)?.t ?? null;

export function summarizeTop(eps: TopEpisode[], hours: number): TopSummary | null {
  if (!eps.length) return null;
  const km = survival(eps);
  const sortedDur = eps.map(e => e.durS).sort((a, b) => a - b);
  const pick = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))]!;
  const units = eps.map(e => e.flow).sort((a, b) => a - b);
  const totalS = eps.reduce((a, e) => a + e.durS, 0);
  const ended = eps.filter(e => e.end !== "cut");
  return {
    n: eps.length, censored: eps.length - ended.length, hours,
    p25: kmQuantile(km, 0.25), p50: kmQuantile(km, 0.5), p75: kmQuantile(km, 0.75), p90: kmQuantile(km, 0.9),
    holdQ: QS.map(q => kmQuantile(km, q) ?? pick(sortedDur, q)),
    meanS: totalS / eps.length,
    beatenFast: ended.filter(e => e.polls === 1).length / Math.max(1, ended.length),
    outbid: ended.filter(e => e.end === "outbid").length / Math.max(1, ended.length),
    gone: ended.filter(e => e.end === "gone").length / Math.max(1, ended.length),
    flowPerMin: totalS > 0 ? (units.reduce((a, b) => a + b, 0) / totalS) * 60 : 0,
    unitsP50: pick(units, 0.5), unitsMean: units.reduce((a, b) => a + b, 0) / units.length,
    // evenly spaced in time so a burst does not dominate; episodes must be in time order
    samples: Array.from({ length: Math.min(MAX_SAMPLES, eps.length) }, (_, i) => eps[Math.floor((i * eps.length) / Math.min(MAX_SAMPLES, eps.length))]!)
      // third value 1 = the best price was NOT beaten: its order was used up or pulled, or our data stopped (censored)
      .map(e => [Math.round(e.durS * 10) / 10, Math.round(e.flow), e.end === "outbid" ? 0 : 1] as [number, number, number]),
  };
}

/**
 * Share of your time spent on top when you relist every time you look and you look every `checkMin` minutes.
 * After a relist you hold the top for T, then wait until the next look: a cycle lasts ceil(T / check) checks.
 * Evaluated over the measured hold-time distribution, so short bursts and long quiet stretches both count.
 */
export function shareOnTopMeasured(holdQ: number[], checkMin: number): number {
  const c = Math.max(1, checkMin * 60);
  let on = 0, cycle = 0;
  for (const t of holdQ) { on += t; cycle += c * Math.max(1, Math.ceil(t / c)); }
  return cycle > 0 ? on / cycle : 0;
}

export interface QuotaEstimate {
  qty: number;
  /** minutes of play to fill, p10 / p50 / p90 */
  p10: number; p50: number; p90: number;
  /** relists (cancel and post again) needed at the median */
  relists: number;
  /** units posted in total (first order + every relist of the remainder), median: what counts toward the daily limit */
  postedUnits: number;
  /** runs where the quota was not filled within the horizon */
  unfinished: number;
  runs: number;
}

/**
 * Time to fill `qty` units with one order that you relist on top whenever you look and see it beaten.
 * Monte Carlo over the measured episodes for this item and side: each cycle draws a real hold time and the real number
 * of units that traded against the top during it, then waits until your next look. Deterministic seed.
 */
export function quotaTime(eps: TopEpisode[], qty: number, checkMin: number, runs = 2000, horizonMin = 24 * 60): QuotaEstimate | null {
  const usable = eps.filter(e => e.durS > 0);
  if (usable.length < MIN_MEASURED_EPISODES || qty <= 0) return null;
  let seed = 0x9e3779b9;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const c = Math.max(1, checkMin) * 60;
  const times: number[] = [], relists: number[] = [], posted: number[] = [];
  let unfinished = 0;
  for (let r = 0; r < runs; r++) {
    let got = 0, t = 0, n = 0, units = qty;
    while (got < qty && t < horizonMin * 60) {
      const e = usable[Math.floor(rnd() * usable.length)]!;
      const need = qty - got;
      if (e.flow >= need) { t += e.durS * (need / e.flow); got = qty; break; }
      got += e.flow;
      t += c * Math.max(1, Math.ceil(e.durS / c));
      n++;
      units += qty - got; // the relist posts what is still missing
    }
    if (got < qty) unfinished++;
    times.push(t / 60);
    relists.push(n);
    posted.push(units);
  }
  posted.sort((a, b) => a - b);
  times.sort((a, b) => a - b);
  relists.sort((a, b) => a - b);
  const q = (p: number) => times[Math.min(times.length - 1, Math.floor(p * times.length))]!;
  return { qty, p10: q(0.1), p50: q(0.5), p90: q(0.9), relists: relists[relists.length >> 1]!, postedUnits: posted[posted.length >> 1]!, unfinished: unfinished / runs, runs };
}
