// Fill-speed calibration from paper trading: how long the buy and the sell side of real (virtual) trades took, compared
// with what the fill model predicted for them when they opened. The flip tables divide the model's fill rates by the
// resulting factor, so predictions follow what the market actually did.
//  - per side (buy orders, sell offers): factor = actual time / predicted time, averaged as a geometric mean (time
//    ratios multiply), pulled toward 1 (the model) by PRIOR_TRADES pseudo-trades: with few trades the model still
//    counts, with many the measurements decide
//  - per item, the item's own trades pulled toward the side's factor by ITEM_PRIOR pseudo-trades
//  - a trade that expired after 6 hours on a side took at least that long: counted at 6 hours (a lower bound)
//  - only trades that recorded the model's prediction per side (`expected.buyH` / `expected.sellH`, since 2026-10-04)
import type { PaperTrade } from "./paper.js";

export interface SideCalibration { factor: number; trades: number }
export interface FillCalibration {
  buy: SideCalibration; sell: SideCalibration;
  /** per item: factors from its own trades (pulled toward the side factor) */
  items: Record<string, { buy?: SideCalibration; sell?: SideCalibration }>;
  /** closed trades with per-side predictions behind this calibration */
  trades: number;
}

export const NO_CALIBRATION: FillCalibration = { buy: { factor: 1, trades: 0 }, sell: { factor: 1, trades: 0 }, items: {}, trades: 0 };
const PRIOR_TRADES = 5, ITEM_PRIOR = 3, MIN_RATIO = 0.1, MAX_RATIO = 30;

/** Actual / predicted hours for each side of each usable trade. */
export function sideRatios(trades: PaperTrade[]): { item: string; side: "buy" | "sell"; ratio: number }[] {
  const out: { item: string; side: "buy" | "sell"; ratio: number }[] = [];
  const clamp = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
  for (const t of trades) {
    const e = t.expected;
    if (!(e.buyH && e.buyH > 0) || !(e.sellH && e.sellH > 0)) continue;
    const end = t.closedAt;
    if (t.boughtAt != null) out.push({ item: t.item, side: "buy", ratio: clamp((t.boughtAt - t.openedAt) / 3.6e6 / e.buyH) });
    else if (t.phase === "expired" && end != null) out.push({ item: t.item, side: "buy", ratio: clamp((end - t.openedAt) / 3.6e6 / e.buyH) }); // never bought out: at least this long
    if (t.boughtAt != null && end != null && (t.phase === "done" || t.phase === "expired")) {
      // sell time for the units bought: a partly bought trade sells fewer, so its prediction scales with them
      const sellH = e.sellH * (t.bought / Math.max(1, t.qty));
      if (sellH > 0) out.push({ item: t.item, side: "sell", ratio: clamp((end - t.boughtAt) / 3.6e6 / sellH) });
    }
  }
  return out;
}

export function calibrate(trades: PaperTrade[]): FillCalibration {
  const r = sideRatios(trades);
  if (!r.length) return NO_CALIBRATION;
  const side = (s: "buy" | "sell"): SideCalibration => {
    const xs = r.filter(x => x.side === s);
    return { factor: Math.exp(xs.reduce((a, x) => a + Math.log(x.ratio), 0) / (xs.length + PRIOR_TRADES)), trades: xs.length };
  };
  const buy = side("buy"), sell = side("sell");
  const items: FillCalibration["items"] = {};
  for (const id of new Set(r.map(x => x.item))) {
    for (const s of ["buy", "sell"] as const) {
      const xs = r.filter(x => x.item === id && x.side === s);
      if (!xs.length) continue;
      const base = Math.log((s === "buy" ? buy : sell).factor);
      (items[id] ??= {})[s] = { factor: Math.exp((xs.reduce((a, x) => a + Math.log(x.ratio), 0) + ITEM_PRIOR * base) / (xs.length + ITEM_PRIOR)), trades: xs.length };
    }
  }
  return { buy, sell, items, trades: trades.filter(t => t.expected.buyH != null && t.expected.sellH != null && t.closedAt != null).length };
}

/** How many times longer than the model this item's orders take on one side (1 = as predicted). */
export const fillFactor = (c: FillCalibration | undefined, item: string, side: "buy" | "sell") =>
  c ? (c.items[item]?.[side] ?? c[side]).factor : 1;
