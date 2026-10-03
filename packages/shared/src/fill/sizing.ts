// Order sizing. How many units to put in one buy order / sell offer, and what that order earns and costs.
//
// Whoever holds the best price gets every instant trade until someone beats them. So a bigger order does not fill
// faster: it only absorbs more of the flow before you next look. Each order you create (and every relist) counts its
// full value toward the daily bazaar limit, so an order that is too big wastes limit on units that never fill, and an
// order that is too small fills and then sits idle until your next look.
//
// The model replays real "time on top" episodes measured from our order books (see toptrack.ts): a sample is
// [seconds a fresh best price stayed best, units that traded against it]. Per order cycle:
//   you post Q units on top -> you hold the top for T (sample) -> the order is filled after T*Q/F if F >= Q
//   -> you notice at your next look (every `check` seconds) -> claim, cancel, post again (one more order created).
// Flow per sample is scaled so the long-run rate matches the item's measured instant-trade flow.
import { BAZAAR } from "../rules/index.js";
import type { HoldStats, Sample } from "../market/index.js";


export interface FillModel {
  basis: "measured" | "estimated";
  samples: Sample[]; // scaled to the flow used by the calculator
  stats: HoldStats | null;
  flowH: number;               // instant trades per hour reaching the top of this side
}

export interface CurvePoint { qty: number; unitsH: number; ordersH: number; onTop: number; fullShare: number }

export const MIN_MEASURED_EPISODES = 8;

/** Order sizes we evaluate: 1, 1.4, 2, 3, 4 ... 65536 and the per-order maximum. */
export const SIZE_GRID: number[] = (() => {
  const g = new Set<number>();
  for (let k = 0; k <= 32; k++) g.add(Math.round(2 ** (k / 2)));
  g.add(BAZAAR.maxUnitsPerOrder);
  return [...g].sort((a, b) => a - b);
})();

/** Samples for one side of one item. Measured episodes when we have enough, otherwise an exponential stand-in. */
export function fillModel(stats: HoldStats | null | undefined, flowH: number, undercutsH: number | null, checkMin: number, unknownShare: number): FillModel {
  const perS = flowH / 3600;
  if (stats && stats.n >= MIN_MEASURED_EPISODES && stats.samples.length >= MIN_MEASURED_EPISODES) {
    // "units traded against the top" includes cancellations; a mass delist inside one stretch would otherwise look like
    // a huge burst of fills (making big orders look fast). Clip each stretch at 3x the 90th percentile, then calibrate.
    const sorted = stats.samples.map(([, f]) => f).sort((a, b) => a - b);
    const clip = 3 * Math.max(1, sorted[Math.floor(0.9 * (sorted.length - 1))]!);
    const clipped = stats.samples.map(([t, f, g]) => [t, Math.min(f, clip), g ?? 0] as Sample);
    stats = { ...stats, samples: clipped };
    const measured = stats.samples.reduce((a, [, f]) => a + f, 0) / Math.max(1e-9, stats.samples.reduce((a, [t]) => a + t, 0));
    const k = measured > 0 ? perS / measured : 0;
    return { basis: "measured", stats, flowH, samples: stats.samples.map(([t, f, g]) => [t, measured > 0 ? f * k : perS * t, g ?? 0] as Sample) };
  }
  // mean hold: from the Poisson undercut rate when known, else from the "unknown competition" share (f = T / (T + c/2))
  const c = checkMin * 60;
  const mean = undercutsH != null ? (undercutsH > 0 ? 3600 / undercutsH : 6 * 3600) : (unknownShare / Math.max(0.01, 1 - unknownShare)) * (c / 2);
  const n = 20, samples: Sample[] = [];
  for (let i = 0; i < n; i++) { const t = -mean * Math.log(1 - (i + 0.5) / n); samples.push([t, perS * t]); }
  return { basis: "estimated", stats: stats ?? null, flowH, samples };
}

export function simulate(samples: Sample[], qty: number, checkS: number): CurvePoint {
  let got = 0, cyc = 0, on = 0, full = 0, cycles = 0;
  // Walk the measured stretches in time order. Each order cycle starts at a stretch; when that stretch ended without
  // anyone beating the price (its order was used up / pulled, or our data stopped) and our order still has units left,
  // our order keeps the top through the following stretches until one ends with the price beaten or we hold our
  // quantity. Those stretches are used up by this cycle (counting them again as new cycles would count the same traded
  // units twice). Backtest: without the continuation, orders of 71,680 were predicted at 0.67x of real fills.
  for (let i = 0; i < samples.length;) {
    let [t, f, g] = samples[i]!;
    let j = i + 1;
    while (g && f < qty && j < samples.length) { const nx = samples[j++]!; t += nx[0]; f += nx[1]; g = nx[2]; }
    i = j;
    const fillAt = f >= qty && f > 0 ? t * (qty / f) : Infinity;
    const end = Math.min(t, fillAt);
    cyc += checkS * Math.max(1, Math.ceil(end / checkS - 1e-9));
    got += Math.min(qty, f);
    on += end;
    if (fillAt <= t) full++;
    cycles++;
  }
  if (cyc <= 0) return { qty, unitsH: 0, ordersH: 0, onTop: 0, fullShare: 0 };
  return { qty, unitsH: (got / cyc) * 3600, ordersH: (cycles / cyc) * 3600, onTop: on / cyc, fullShare: full / Math.max(1, cycles) };
}

const curves = new WeakMap<FillModel, Map<number, CurvePoint[]>>();
/** Units/hour, orders/hour and time on top for every size in SIZE_GRID (memoised per model and check interval). */
export function curve(m: FillModel, checkMin: number): CurvePoint[] {
  let byCheck = curves.get(m);
  if (!byCheck) curves.set(m, (byCheck = new Map()));
  let c = byCheck.get(checkMin);
  if (!c) {
    // A size that fills just after you look waits a whole extra interval, so the raw rate is not monotone in size.
    // Nobody would post a bigger order that earns less: each grid size keeps the best result of any size up to it.
    let best: CurvePoint | null = null;
    c = SIZE_GRID.map(q => {
      const p = simulate(m.samples, q, checkMin * 60);
      // averaging stretches of different speeds can land slightly above the true rate: one order never fills more than
      // every instant trade on its side of the market
      p.unitsH = Math.min(p.unitsH, m.flowH);
      if (!best || p.unitsH > best.unitsH) best = p;
      return { ...best, qty: q };
    });
    byCheck.set(checkMin, c);
  }
  return c;
}

/** Point on the curve for any size (log-linear between grid sizes). */
export function at(c: CurvePoint[], qty: number): CurvePoint {
  if (qty <= c[0]!.qty) { const p = c[0]!; const k = qty / p.qty; return { ...p, qty, unitsH: p.unitsH * k }; }
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!;
    if (qty <= b.qty) {
      const w = (Math.log(qty) - Math.log(a.qty)) / (Math.log(b.qty) - Math.log(a.qty));
      const mix = (x: number, y: number) => x + (y - x) * w;
      return { qty, unitsH: mix(a.unitsH, b.unitsH), ordersH: mix(a.ordersH, b.ordersH), onTop: mix(a.onTop, b.onTop), fullShare: mix(a.fullShare, b.fullShare) };
    }
  }
  return { ...c[c.length - 1]!, qty };
}

/** Smallest order size that delivers `unitsH` (or the largest allowed size if even that is not enough). */
export function sizeFor(c: CurvePoint[], unitsH: number, maxQty: number): CurvePoint {
  const top = at(c, maxQty);
  // asking for the full capacity (or more) gets the smallest size that reaches it, not the largest allowed
  unitsH = Math.min(unitsH, top.unitsH * (1 - 1e-9));
  let lo = 1, hi = maxQty;
  if (at(c, lo).unitsH >= unitsH) return at(c, lo);
  for (let i = 0; i < 40 && hi - lo > 0.5; i++) {
    const mid = Math.sqrt(lo * hi);
    if (at(c, mid).unitsH >= unitsH) hi = mid; else lo = mid;
  }
  return at(c, Math.ceil(hi));
}
