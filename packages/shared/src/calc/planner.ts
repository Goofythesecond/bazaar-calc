// Unified route planner: picks the set of bazaar / craft / book / forge flips that earns the most per DAY within
// your order slots, forge slots, coins, daily bazaar limit and clicking time (see plan()).
import { orderSlots } from "../rules/bazaar.js";
import { FORGE, forgeSlots } from "../rules/forge.js";
import { type Opportunity, type Settings, evaluate } from "./engine.js";
import type { Profile } from "../requirements.js";

export interface PlanOptions {
  kinds?: Opportunity["kind"][];
  requireMet?: boolean;          // drop routes whose requirements you have not met
  maxPicks?: number;
}

export interface Plan {
  picks: Opportunity[];
  totals: { coinsH: number; capitalUsed: number; ordersUsed: number; orderSlots: number; forgeSlotsUsed: number; forgeSlots: number;
    limitCoinsDay: number; dailyLimit: number; activeMinutesH: number; coinsDay: number };
  skipped: { key: string; title: string; reason: string }[];
}

/** Coins/h are per hour played for every kind (forge output already accounts for running 24 h/day). */
export function dayValue(o: Opportunity, s: Settings): number {
  return o.coinsH * s.hoursPerDay;
}

/**
 * Coins are the usual bottleneck, so they are handed out in small steps (5% of your coins): each step goes to the
 * route (new or already picked) that earns the most extra coins/h from it, given the order slots, forge slots, daily
 * limit and clicking time the other picks leave. A route that ties up 70M for 19M/h no longer blocks one that makes
 * 15M/h from 30M. Two picks never order the same item (they would compete with each other).
 */
export function plan(candidates: Opportunity[], s: Settings, p: Profile, opts: PlanOptions = {}): Plan {
  const slots = orderSlots(s.bazaarFlipperLevel);
  // same assumption as the engine: HotM not set -> the minimum that unlocks the Forge
  const fSlots = forgeSlots(p.hotmTier) || forgeSlots(FORGE.minHotm);
  const skipped: Plan["skipped"] = [];
  const pool = candidates
    .filter(o => !opts.kinds || opts.kinds.includes(o.kind))
    .filter(o => !opts.requireMet || o.unmet.length === 0)
    .filter(o => o.profitPerUnit > 0)
    .sort((a, b) => dayValue(b, s) - dayValue(a, s))
    .slice(0, 80);
  const picks: { c: Opportunity; o: Opportunity }[] = [];
  // two picks never trade the same item: shared buy orders would outbid each other, and shared instant buys would both
  // count the same sellers' supply
  const items = (c: Opportunity) => [c.outputId, ...c.buys.filter(b => b.mode !== "npc").map(b => b.item)];
  const step = Math.max(1, s.coins / 20);
  /**
   * Best next move for candidate `c`, scored by extra coins/h per extra coin tied up. A picked route can take one more
   * step of coins; a new route is tried at several sizes (one step, 2, 4, 10 steps, everything left), because a route
   * whose smallest batch costs 48M earns nothing from a 5M step yet may earn the most per coin once it fits.
   */
  const tryAdd = (c: Opportunity) => {
    const free = s.coins - picks.reduce((a, x) => a + x.o.capitalUsed, 0);
    if (free < 1) return null;
    const idx = picks.findIndex(x => x.c.key === c.key);
    const others = picks.filter((_, i) => i !== idx);
    if (idx < 0) {
      if (picks.length >= (opts.maxPicks ?? 50)) return null;
      const taken = new Set(others.flatMap(x => items(x.c)));
      if (items(c).some(i => taken.has(i))) return null;
      if (c.ordersUsed > slots - others.reduce((a, x) => a + x.o.ordersUsed, 0)) return null;
    }
    const forge = c.steps.some(x => x.type === "forge");
    const forgeLeft = fSlots - others.reduce((a, x) => a + x.o.forgeSlotsUsed, 0);
    if (forge && forgeLeft <= 0) return null;
    const have = idx >= 0 ? picks[idx]!.o : null;
    const limits = {
      activeSecondsH: 3600 * s.attention - others.reduce((a, x) => a + x.o.activeSecondsH, 0),
      limitCoinsDay: s.dailyLimit - others.reduce((a, x) => a + x.o.limitCoinsH, 0) * s.hoursPerDay,
      forgeSlots: forge ? forgeLeft : undefined,
    };
    const sizes = have ? [Math.min(step, free)] : [...new Set([1, 2, 4, 10].map(k => Math.min(k * step, free)).concat(free))];
    let bestMove: { o: Opportunity; idx: number; gain: number; score: number } | null = null;
    for (const add of sizes) {
      const o = evaluate(c, s, p, (have?.capitalUsed ?? 0) + add, limits);
      if (o.coinsH <= 0 || o.unitsH < s.minUnitsPerHour) continue;
      // Coins are not the only scarce thing: order and forge slots, the daily limit and your clicking time run out too. A move is
      // charged for whichever of them it uses up fastest, each scaled to "coins" by the share of the total it takes
      // (so with 10B coins the daily limit, not coins, decides; with 100M coins it is usually coins).
      const share = (used: number, total: number) => (total > 0 ? (used / total) * s.coins : Infinity);
      const charge = Math.max(
        o.capitalUsed - (have?.capitalUsed ?? 0),
        have ? 0 : share(o.ordersUsed, slots),
        share((o.limitCoinsH - (have?.limitCoinsH ?? 0)) * s.hoursPerDay, s.dailyLimit),
        share(o.activeSecondsH - (have?.activeSecondsH ?? 0), 3600 * s.attention),
        // forge slots too: a route that ties up every slot for 0.1M/h must not block one making 16M/h from one slot
        forge ? share(o.forgeSlotsUsed - (have?.forgeSlotsUsed ?? 0), fSlots) : 0,
      );
      const gain = o.coinsH - (have?.coinsH ?? 0), extra = Math.max(1, charge);
      const score = gain / extra;
      if (gain > 1 && (!bestMove || score > bestMove.score)) bestMove = { o, idx, gain, score };
    }
    return bestMove;
  };
  // lazy greedy: a candidate's score (coins/h per coin) mostly shrinks as the plan fills up, so stale scores serve as
  // upper bounds and only the candidates that could still win are re-evaluated each round
  const scores = new Map<string, number>(pool.map(c => [c.key, Infinity]));
  for (let round = 0; round < 120; round++) {
    let winner: { c: Opportunity; o: Opportunity; idx: number; gain: number; score: number } | null = null;
    const order = pool.filter(c => (scores.get(c.key) ?? 0) > 0).sort((a, b) => scores.get(b.key)! - scores.get(a.key)!);
    for (const c of order) {
      if (winner && scores.get(c.key)! <= winner.score) break;
      const r = tryAdd(c);
      scores.set(c.key, r ? r.score : 0);
      if (r && (!winner || r.score > winner.score)) winner = { c, ...r };
    }
    if (!winner) break;
    // the winner's next step is worth re-checking next round (its score was just used up)
    scores.set(winner.c.key, Infinity);
    if (winner.idx >= 0) picks[winner.idx]!.o = winner.o; else picks.push({ c: winner.c, o: winner.o });
  }
  const chosen = new Set(picks.map(x => x.c.key));
  const taken = new Set(picks.flatMap(x => items(x.c)));
  for (const c of pool) if (!chosen.has(c.key))
    skipped.push({ key: c.key, title: c.title, reason: items(c).some(i => taken.has(i)) ? "uses an item already in the plan"
      : "earns less per coin, per slot or per minute of clicking than the routes picked" });
  const out = picks.map(x => x.o).sort((a, b) => b.coinsH - a.coinsH);
  const sum = (f: (o: Opportunity) => number) => out.reduce((a, o) => a + f(o), 0);
  const coinsH = sum(o => o.coinsH);
  return {
    picks: out, skipped,
    totals: {
      coinsH, capitalUsed: sum(o => o.capitalUsed), ordersUsed: sum(o => o.ordersUsed), orderSlots: slots,
      forgeSlotsUsed: sum(o => o.forgeSlotsUsed), forgeSlots: fSlots, limitCoinsDay: sum(o => o.limitCoinsH) * s.hoursPerDay,
      dailyLimit: s.dailyLimit, activeMinutesH: sum(o => o.activeSecondsH) / 60,
      coinsDay: coinsH * s.hoursPerDay,
    },
  };
}
