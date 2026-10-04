// How much to trust a route's numbers, from the evidence behind them. A ranking aid with stated reasons, not a
// probability: each factor below is 1 when the evidence is complete and smaller when it is thin, and the score is
// their product.
//   fill     order legs: fill times measured from >= 8 time-on-top episodes (1) or estimated (0.6); measured from fewer
//            than 30 episodes: 0.75-1 (the fill backtest's biggest misses on 2026-10-04 came from sides with 6-17 episodes)
//   price    the sale price backed by history: 24 h median from >= 6 hourly closes (1), 7-day median (0.85), none (0.6);
//            NPC sales have a fixed price (1); auction reference prices: 0.85 with >= 5 sales a day, else 0.6
//   flow     hours of watched trading behind the trade rates (least of the items traded): >= 12 h (1), else 0.7-1
//   warnings likely_manipulated (0.3), any other serious flag (0.6), low_history (0.85)
//   age      static site: age of the published history: <= 24 h (1), <= 72 h (0.8), older (0.6)
// Level: high >= 0.75, medium >= 0.5, low below.
import { type ItemMarket, type Market, seriousFlags, typicalPrice } from "../market/index.js";
import type { Opportunity } from "./engine.js";

export interface Confidence { score: number; level: "high" | "medium" | "low"; reasons: string[] }
/** A route as the flip tables and the planner receive it: with its confidence and coins/h x confidence. */
export type RankedOpportunity = Opportunity & { confidence: Confidence; scoreH: number };

export function routeConfidence(o: Opportunity, market: Market, statsAgeH = 0): Confidence {
  const reasons: string[] = [];
  let score = 1;
  const factor = (f: number, why: string) => { if (f < 1) { score *= f; reasons.push(why); } };

  const estimated = o.orderPlan.filter(l => l.basis !== "measured");
  if (estimated.length) factor(0.6, `fill times estimated (too few measured episodes) for ${estimated.map(l => l.name).join(", ")}`);
  const thin = o.orderPlan.filter(l => l.basis === "measured" && (l.hold?.n ?? 0) < 30);
  if (thin.length) {
    const n = Math.min(...thin.map(l => l.hold?.n ?? 0));
    factor(0.75 + 0.25 * Math.max(0, n - 8) / 22, `fill times measured from only ${n} time-on-top episodes (${[...new Set(thin.map(l => l.name))].join(", ")})`);
  }

  const sold = market.get(o.sell.item);
  if (o.sell.mode === "offer" || o.sell.mode === "instant") {
    const t = sold && typicalPrice(sold, o.sell.mode === "offer" ? "ask" : "bid");
    if (!t) factor(0.6, `no price history for ${o.sell.name}: the sale price is today's only`);
    else if (t.basis.startsWith("7")) factor(0.85, `${o.sell.name}: price backed by the 7-day median only`);
  } else if (o.sell.mode === "ah_reference") {
    factor((sold?.ahSales24h ?? 0) >= 5 ? 0.85 : 0.6, `${o.sell.name}: auction-house reference price (${sold?.ahSales24h ?? 0} sales in 24 h)`);
  }

  const traded = [...new Set([...o.buys.filter(b => b.mode !== "npc").map(b => b.item), ...(o.sell.mode === "npc" ? [] : [o.sell.item])])]
    .map(id => market.get(id)).filter((m): m is ItemMarket => !!m && (m.ask != null || m.bid != null));
  const hours = traded.length ? Math.min(...traded.map(m => m.liveHours ?? 0)) : 24;
  if (hours < 12) factor(0.7 + 0.3 * (hours / 12), `only ${hours.toFixed(1)} h of watched trading behind the trade rates`);

  const flags = new Set(traded.flatMap(m => m.flags));
  if (flags.has("likely_manipulated")) factor(0.3, "a traded item looks manipulated");
  else if (traded.some(m => seriousFlags(m).length)) factor(0.6, `market warnings: ${[...new Set(traded.flatMap(m => seriousFlags(m)))].join(", ")}`);
  else if (flags.has("low_history")) factor(0.85, "little history for a traded item");

  if (statsAgeH > 72) factor(0.6, `published history is ${(statsAgeH / 24).toFixed(1)} days old`);
  else if (statsAgeH > 24) factor(0.8, `published history is ${Math.round(statsAgeH)} h old`);

  return { score, level: score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low", reasons };
}
