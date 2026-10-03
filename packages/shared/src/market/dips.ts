// Dips: bazaar items whose instant-buy price sits well below their typical level from history, with what buying the
// cheap units now and selling back at the typical level would earn after tax. A dip can be a bargain or the start of a
// lasting fall: the typical price says which history backs it, and market warnings are kept on every row.
// The typical level is the LOWER of the 24 h and 7-day medians: after a spike the 24 h median stays inflated, and a price
// falling back to normal must not look like a bargain (seen 2026-10-03: Shard Sea Serpent back at its 7-day level of
// ~190k read as "82% below" a 24 h median of ~1M).
// Each dip also says whether it is new: still at the typical level about an hour ago, or already this low then (a steady
// slide, or a level the market has settled at; seen the same day: Ultimate Wisdom III back at ~1M after a 13M spike).
import { taxRate } from "../rules/index.js";
import { TYPICAL_MIN_HOURS, seriousFlags } from "./signals.js";
import type { ItemMarket, Market } from "./types.js";

/** Lower of the 24 h and 7-day medians that have enough hourly closes behind them. */
function lowTypical(m: ItemMarket, side: "ask" | "bid"): { price: number; basis: string; hours: number } | null {
  const r = m.ref;
  if (!r) return null;
  const d = side === "ask" ? r.ask24 : r.bid24, w = side === "ask" ? r.ask7 : r.bid7;
  const day = d != null && (r.n24 ?? 0) >= TYPICAL_MIN_HOURS.day ? { price: d, basis: "24 h median", hours: r.n24 ?? 0 } : null;
  const week = w != null && (r.n7 ?? 0) >= TYPICAL_MIN_HOURS.week ? { price: w, basis: "7-day median", hours: r.n7 ?? 0 } : null;
  if (day && week) return day.price <= week.price ? { ...day, basis: "24 h median (below the 7-day)" } : { ...week, basis: "7-day median (below the 24 h)" };
  return day ?? week;
}

export interface Dip {
  id: string; name: string;
  ask: number; bid: number | null;
  typicalAsk: number; typicalBid: number | null; basis: string; hours: number;
  /** 0.25 = the cheapest sell offer is 25% below its typical level */
  drop: number;
  /** units offered at or below the dip threshold right now */
  cheapUnits: number;
  /** per unit, after tax: relist as a sell offer at the typical sell-offer price */
  profitOffer: number;
  /** per unit, after tax: sell into buy orders at the typical buy-order price */
  profitInstant: number | null;
  /** cheap units x profit, at most a day of buyers (Hypixel's 7-day rate) */
  potential: number;
  flags: string[];
  /** "new": the cheapest offer about an hour ago was still at the typical level; "lasting": it was already below it;
   *  "unknown": no price from an hour ago (static site with old statistics) */
  since: "new" | "lasting" | "unknown";
  askHourAgo: number | null;
}

export function findDips(market: Market, opts: { minDrop?: number; flipperLevel?: number; quadTaxes?: boolean } = {}): Dip[] {
  const minDrop = opts.minDrop ?? 0.1, tax = taxRate(opts.flipperLevel ?? 0, opts.quadTaxes);
  const out: Dip[] = [];
  for (const m of market.values()) {
    if (m.ask == null || !m.topAsk?.length) continue;
    const ta = lowTypical(m, "ask");
    if (!ta || m.ask > ta.price * (1 - minDrop)) continue;
    const tb = lowTypical(m, "bid");
    const limit = ta.price * (1 - minDrop);
    const cheapUnits = m.topAsk.filter(l => l.price <= limit).reduce((a, l) => a + l.amount, 0);
    const profitOffer = (ta.price - 0.1) * (1 - tax) - m.ask;
    const profitInstant = tb ? tb.price * (1 - tax) - m.ask : null;
    const buyersDay = m.ibuyWeek / 7;
    const askHourAgo = m.ref?.hourAgo?.ask ?? null;
    out.push({ id: m.id, name: m.name, ask: m.ask, bid: m.bid, typicalAsk: ta.price, typicalBid: tb?.price ?? null, basis: ta.basis, hours: ta.hours,
      drop: 1 - m.ask / ta.price, cheapUnits, profitOffer, profitInstant,
      potential: Math.max(0, profitOffer) * Math.min(cheapUnits, buyersDay), flags: seriousFlags(m),
      since: askHourAgo == null ? "unknown" : askHourAgo > limit ? "new" : "lasting", askHourAgo });
  }
  return out.sort((a, b) => b.potential - a.potential || b.drop - a.drop);
}
