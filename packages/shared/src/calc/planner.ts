// Unified route planner: picks the set of flips (every kind) that earns the most over your play time within your order
// slots, forge slots, coins, daily bazaar limit (spread over your hours), NPC sell cap and clicking time (see plan()).
//  - each order route runs one trade at a time or keeps the next buy order up while selling, whichever earns more with
//    what is left (one trade at a time holds one side's slots, not both)
//  - moves are weighted by the route's confidence; picks earning under 100k/h or 1% of the plan are dropped
//  - the plan says which budget stops it from earning more
import { BAZAAR, orderSlots, FORGE, forgeSlots, type Profile } from "../rules/index.js";
import { type Opportunity, type Settings, evaluate } from "./engine.js";

export interface PlanOptions {
  kinds?: Opportunity["kind"][];
  requireMet?: boolean;          // drop routes whose requirements you have not met
  maxPicks?: number;
  /** order slots on top of your Bazaar Flipper level's (for "what would one more slot add") */
  extraSlots?: number;
  /** plan in one pass with these budget weights (the what-if plans reuse the main plan's) */
  weights?: PlanWeights;
  /** internal: this plan is the "fewer coins" re-plan (see plan) */
  noRecap?: boolean;
  /** evaluations already made (same route, mode, coins and budgets left give the same result): shared by the passes
   *  and by the what-if plans of one request */
  cache?: Map<string, Opportunity>;
}

/** A pick must earn at least this much per hour, and this share of the plan: a slot and the clicks are not worth less. */
export const MIN_PICK_COINS_H = 100_000, MIN_PICK_SHARE = 0.01;

export interface Plan {
  picks: Opportunity[];
  totals: { coinsH: number; capitalUsed: number; ordersUsed: number; orderSlots: number; forgeSlotsUsed: number; forgeSlots: number;
    limitCoinsDay: number; dailyLimit: number; activeMinutesH: number; coinsDay: number;
    /** share of each budget the plan uses (coins, order slots, daily bazaar limit, clicking time, forge slots) */
    usage: { coins: number; slots: number; limit: number; clicks: number; forge: number };
    /** what stops the plan from earning more: the budgets it has used up, or "no more profitable flips" */
    limitedBy: string };
  skipped: { key: string; title: string; reason: string }[];
  /** the budget weights of the pass that won */
  weights: PlanWeights;
}

/** Coins/h are per hour played for every kind (forge output already accounts for running 24 h/day). */
export function dayValue(o: Opportunity, s: Settings): number {
  return o.coinsH * s.hoursPerDay;
}

/** How much each budget costs in a move's charge (1 = coins at face value, the others scaled to coins by share used). */
export interface PlanWeights { coins: number; slots: number; limit: number; clicks: number; forge: number }
const EVEN: PlanWeights = { coins: 1, slots: 1, limit: 1, clicks: 1, forge: 1 };

/**
 * Coins are handed out in small steps (5% of your coins, at most 50M): each step goes to the route (new or already picked) that earns
 * the most extra coins/h for what it uses up, given the order slots, forge slots, daily limit and clicking time the
 * other picks leave. A move is charged for whichever budget it uses up fastest, each weighted by how scarce it is.
 * Which budget is scarce depends on your coins (100M: coins; 1B: the daily limit; 10B: slots and the limit), so the plan
 * is made up to four times: after each pass, budgets it used up cost twice as much and budgets with room half as much,
 * and the best pass wins. (With every budget weighted the same, 10B coins planned less than 1B: small picks filled the
 * slots and pushed out a 25M/h route.) Two picks never trade the same item (they would compete with each other).
 */
export function plan(candidates: Opportunity[], s: Settings, p: Profile, opts: PlanOptions = {}): Plan {
  const slots = orderSlots(s.bazaarFlipperLevel) + (opts.extraSlots ?? 0);
  // confidence-weighted: a route whose numbers are uncertain must not take most of your coins (1 when not scored)
  const conf = (c: Opportunity) => (c as Opportunity & { confidence?: { score: number } }).confidence?.score ?? 1;
  // same assumption as the engine: HotM not set -> the minimum that unlocks the Forge
  const fSlots = forgeSlots(p.hotmTier) || forgeSlots(FORGE.minHotm);
  const pool = candidates
    .filter(o => !opts.kinds || opts.kinds.includes(o.kind))
    .filter(o => !opts.requireMet || o.unmet.length === 0)
    .filter(o => o.profitPerUnit > 0)
    .sort((a, b) => dayValue(b, s) * conf(b) - dayValue(a, s) * conf(a))
    .slice(0, 80);
  // two picks never trade the same item: shared buy orders would outbid each other, and shared instant buys would both
  // count the same sellers' supply
  const items = (c: Opportunity) => [c.outputId, ...c.buys.filter(b => b.mode !== "npc").map(b => b.item)];
  // coins go out in steps of 5%, at most 50M: with 10B a 500M step sized routes into huge orders that burn the daily
  // limit for little extra profit (10B planned less than 1B)
  const step = Math.max(1, Math.min(s.coins, 1e9) / 20);
  // a route with a buy order and a sell offer can run one trade at a time (fewer coins and slots) or keep the next buy
  // order up while selling (faster): each move tries both and keeps the better
  const modes = (c: Opportunity) => (c.buys.some(b => b.mode === "order") && c.sell.mode === "offer" ? [s, { ...s, overlapOrders: !s.overlapOrders }] : [s]);
  type Pick = { c: Opportunity; o: Opportunity };
  const cache = opts.cache ?? new Map<string, Opportunity>();
  const evalCached = (c: Opportunity, ms: Settings, capital: number, limits: Parameters<typeof evaluate>[4]) => {
    const k = `${c.key}|${ms.overlapOrders ? 1 : 0}|${capital}|${limits!.activeSecondsH}|${limits!.limitCoinsDay}|${limits!.forgeSlots ?? ""}|${limits!.npcSellCoinsDay}`;
    let o = cache.get(k);
    if (!o) cache.set(k, (o = evaluate(c, ms, p, capital, limits)));
    return o;
  };
  const usageOf = (out: Opportunity[]) => {
    const sum = (f: (o: Opportunity) => number) => out.reduce((a, o) => a + f(o), 0);
    return {
      coins: sum(o => o.capitalUsed) / Math.max(1, s.coins), slots: sum(o => o.ordersUsed) / Math.max(1, slots),
      limit: (sum(o => o.limitCoinsH) * s.hoursPerDay) / Math.max(1, s.dailyLimit), clicks: sum(o => o.activeSecondsH) / Math.max(1, 3600 * s.attention),
      forge: sum(o => o.forgeSlotsUsed) / Math.max(1, fSlots),
    };
  };

  /** One greedy pass with these budget weights. */
  const greedy = (w: PlanWeights) => {
    const picks: Pick[] = [], dropped: Plan["skipped"] = [];
    /**
     * Best next move for candidate `c`. A picked route can take one more step of coins; a new route is tried at several
     * sizes (one step, 2, 4, 10 steps, everything left), because a route whose smallest batch costs 48M earns nothing
     * from a 5M step yet may earn the most per coin once it fits.
     */
    const tryAdd = (c: Opportunity, allowNew: boolean) => {
      const free = s.coins - picks.reduce((a, x) => a + x.o.capitalUsed, 0);
      if (free < 1) return null;
      const idx = picks.findIndex(x => x.c.key === c.key);
      const others = picks.filter((_, i) => i !== idx);
      const slotsLeft = slots - others.reduce((a, x) => a + x.o.ordersUsed, 0);
      if (idx < 0) {
        if (!allowNew || picks.length >= (opts.maxPicks ?? 50)) return null;
        const taken = new Set(others.flatMap(x => items(x.c)));
        if (items(c).some(i => taken.has(i))) return null;
        if (slotsLeft < 1 && c.ordersUsed > 0) return null;
      }
      const forge = c.steps.some(x => x.type === "forge");
      const forgeLeft = fSlots - others.reduce((a, x) => a + x.o.forgeSlotsUsed, 0);
      if (forge && forgeLeft <= 0) return null;
      // Kat cares for one pet at a time: one Kat route in a plan
      if (c.steps.some(x => x.type === "kat") && others.some(x => x.c.steps.some(y => y.type === "kat"))) return null;
      const have = idx >= 0 ? picks[idx]!.o : null;
      const limits = {
        activeSecondsH: 3600 * s.attention - others.reduce((a, x) => a + x.o.activeSecondsH, 0),
        limitCoinsDay: s.dailyLimit - others.reduce((a, x) => a + x.o.limitCoinsH, 0) * s.hoursPerDay,
        forgeSlots: forge ? forgeLeft : undefined,
        // NPC shops pay at most 500M coins a day across all your NPC sales
        npcSellCoinsDay: BAZAAR.npcDailySellCoins - others.reduce((a, x) => a + x.o.npcSellCoinsH, 0) * s.hoursPerDay,
      };
      // a new route starts at 1-20 steps (at most 1B); it grows a step at a time from there. Starting it with all coins
      // left sized huge orders that burned the daily limit, so 10B planned less than 1B (2026-10-05 market)
      const sizes = have ? [Math.min(step, free)] : [...new Set([1, 2, 4, 10, 20].map(k => Math.min(k * step, free)))];
      let bestMove: { o: Opportunity; idx: number; gain: number; score: number } | null = null;
      // each budget scaled to "coins" by the share of it a move takes
      const share = (used: number, total: number) => (total > 0 ? (used / total) * s.coins : Infinity);
      for (const add of sizes) for (const ms of modes(c)) {
        const o = evalCached(c, ms, (have?.capitalUsed ?? 0) + add, limits);
        if (o.coinsH <= 0 || o.unitsH < s.minUnitsPerHour || o.ordersUsed > slotsLeft) continue;
        const charge = Math.max(
          w.coins * (o.capitalUsed - (have?.capitalUsed ?? 0)),
          w.slots * share(o.ordersUsed - (have?.ordersUsed ?? 0), slots),
          w.limit * share((o.limitCoinsH - (have?.limitCoinsH ?? 0)) * s.hoursPerDay, s.dailyLimit),
          w.clicks * share(o.activeSecondsH - (have?.activeSecondsH ?? 0), 3600 * s.attention),
          // forge slots too: a route that ties up every slot for 0.1M/h must not block one making 16M/h from one slot
          forge ? w.forge * share(o.forgeSlotsUsed - (have?.forgeSlotsUsed ?? 0), fSlots) : 0,
          share((o.npcSellCoinsH - (have?.npcSellCoinsH ?? 0)) * s.hoursPerDay, BAZAAR.npcDailySellCoins),
        );
        const gain = o.coinsH - (have?.coinsH ?? 0), extra = Math.max(1, charge);
        const score = (gain * conf(c)) / extra;
        if (gain > 1 && (!bestMove || score > bestMove.score)) bestMove = { o, idx, gain, score };
      }
      return bestMove;
    };
    // lazy greedy: a candidate's score mostly shrinks as the plan fills up, so stale scores serve as upper bounds and only
    // the candidates that could still win are re-evaluated each round
    const rounds = (allowNew: boolean) => {
      const scores = new Map<string, number>(pool.map(c => [c.key, Infinity]));
      for (let round = 0; round < 120; round++) {
        let winner: { c: Opportunity; o: Opportunity; idx: number; gain: number; score: number } | null = null;
        const order = pool.filter(c => (scores.get(c.key) ?? 0) > 0).sort((a, b) => scores.get(b.key)! - scores.get(a.key)!);
        for (const c of order) {
          if (winner && scores.get(c.key)! <= winner.score) break;
          const r = tryAdd(c, allowNew);
          scores.set(c.key, r ? r.score : 0);
          if (r && (!winner || r.score > winner.score)) winner = { c, ...r };
        }
        if (!winner) break;
        // the winner's next step is worth re-checking next round (its score was just used up)
        scores.set(winner.c.key, Infinity);
        if (winner.idx >= 0) picks[winner.idx]!.o = winner.o; else picks.push({ c: winner.c, o: winner.o });
      }
    };
    rounds(true);
    // swaps: a pick blocks the routes that share an item with it (or another Kat pet). Adding routes one at a time can
    // lock in the weaker of two such rivals (10B coins picked a 13.5M/h Kat route over a 17.3M/h one), so each pick is
    // compared with the routes it alone blocks, with the coins and budgets it holds (and coins nobody uses), and the better
    // one stays
    const conflicts = (a: Opportunity, b: Opportunity) => items(a).some(i => items(b).includes(i)) || (a.steps.some(x => x.type === "kat") && b.steps.some(x => x.type === "kat"));
    let swapped = false;
    for (let i = 0; i < picks.length; i++) {
      const x = picks[i]!, others = picks.filter((_, j) => j !== i);
      const rivals = pool.filter(c => c.key !== x.c.key && !picks.some(y => y.c.key === c.key) && conflicts(c, x.c) && !others.some(y => conflicts(c, y.c)));
      if (!rivals.length) continue;
      const limits = {
        activeSecondsH: 3600 * s.attention - others.reduce((a, y) => a + y.o.activeSecondsH, 0),
        limitCoinsDay: s.dailyLimit - others.reduce((a, y) => a + y.o.limitCoinsH, 0) * s.hoursPerDay,
        forgeSlots: fSlots - others.reduce((a, y) => a + y.o.forgeSlotsUsed, 0),
        npcSellCoinsDay: BAZAAR.npcDailySellCoins - others.reduce((a, y) => a + y.o.npcSellCoinsH, 0) * s.hoursPerDay,
      };
      const slotsLeft = slots - others.reduce((a, y) => a + y.o.ordersUsed, 0);
      // the coins the pick holds, plus any nobody uses
      const coinsFor = s.coins - others.reduce((a, y) => a + y.o.capitalUsed, 0);
      let best = x;
      for (const c of rivals) for (const ms of modes(c)) {
        const o = evalCached(c, ms, coinsFor, { ...limits, forgeSlots: c.steps.some(st => st.type === "forge") ? limits.forgeSlots : undefined });
        if (o.ordersUsed <= slotsLeft && o.coinsH * conf(c) > best.o.coinsH * conf(best.c) * 1.001) best = { c, o };
      }
      if (best !== x) { picks[i] = best; swapped = true; }
    }
    if (swapped) rounds(false);
    // picks earning next to nothing cost a slot and clicks for little: drop them and give what they held to the others
    const total = picks.reduce((a, x) => a + x.o.coinsH, 0), floor = Math.max(MIN_PICK_COINS_H, MIN_PICK_SHARE * total);
    const tiny = picks.filter(x => x.o.coinsH < floor);
    if (tiny.length) {
      for (const x of tiny) { picks.splice(picks.indexOf(x), 1); dropped.push({ key: x.c.key, title: x.c.title, reason: `would earn only ${Math.round(x.o.coinsH / 1000)}k/h here: not worth a slot and the clicks (picks earn at least ${Math.round(floor / 1000)}k/h)` }); }
      rounds(false);
    }
    return { picks, dropped, coinsH: picks.reduce((a, x) => a + x.o.coinsH, 0) };
  };

  let w: PlanWeights = { ...(opts.weights ?? EVEN) }, best: ReturnType<typeof greedy> & { w: PlanWeights } | null = null;
  for (let pass = 0; pass < (opts.weights ? 1 : 4); pass++) {
    const r = greedy(w);
    if (!best || r.coinsH > best.coinsH) best = { ...r, w };
    const u = usageOf(r.picks.map(x => x.o));
    const next = Object.fromEntries((Object.keys(w) as (keyof PlanWeights)[]).map(k => [k, u[k] >= 0.95 ? w[k] * 2 : u[k] < 0.5 ? Math.max(1 / 8, w[k] / 2) : w[k]])) as unknown as PlanWeights;
    if ((Object.keys(w) as (keyof PlanWeights)[]).every(k => next[k] === w[k])) break;
    w = next;
  }
  // more coins can always do what fewer coins did: a plan that leaves over half its coins unused is also made with twice
  // the coins it used, and the better one stays (2026-10-05: 10B planned 131.3M/h and 1B 135.6M/h, because with plenty
  // of coins the daily limit went to other routes before a 17M/h Kat route)
  let { picks, dropped } = best!, weights = best!.w;
  if (!opts.weights && !opts.noRecap) {
    const used = picks.reduce((a, x) => a + x.o.capitalUsed, 0);
    if (used < s.coins / 2) {
      const alt = plan(candidates, { ...s, coins: Math.max(2 * used, step) }, p, { ...opts, noRecap: true });
      if (alt.totals.coinsH > best!.coinsH * 1.001) {
        picks = alt.picks.map(o => ({ c: pool.find(c => c.key === o.key) ?? o, o }));
        dropped = alt.skipped.filter(x => x.reason.startsWith("would earn only"));
        weights = alt.weights;
      }
    }
  }
  const skipped: Plan["skipped"] = [...dropped];
  const chosen = new Set(picks.map(x => x.c.key));
  const taken = new Set(picks.flatMap(x => items(x.c)));
  for (const c of pool) if (!chosen.has(c.key) && !skipped.some(x => x.key === c.key))
    skipped.push({ key: c.key, title: c.title, reason: items(c).some(i => taken.has(i)) ? "uses an item already in the plan"
      : "earns less per coin, per slot or per minute of clicking than the routes picked" });
  const out = picks.map(x => x.o).sort((a, b) => b.coinsH - a.coinsH);
  const sum = (f: (o: Opportunity) => number) => out.reduce((a, o) => a + f(o), 0);
  const coinsH = sum(o => o.coinsH);
  const usage = usageOf(out);
  const names = { coins: "your coins", slots: "your order slots", limit: "the daily bazaar limit", clicks: "your clicking time", forge: "your forge slots" } as const;
  // every budget the plan has used up (95%+), most used first
  const full = (Object.entries(usage) as [keyof typeof usage, number][]).filter(([, v]) => v >= 0.95).sort((a, b) => b[1] - a[1]).map(([k]) => names[k]);
  const limitedBy = !full.length ? "no more profitable flips" : full.length === 1 ? full[0]! : `${full.slice(0, -1).join(", ")} and ${full.at(-1)}`;
  return {
    picks: out, skipped, weights,
    totals: {
      coinsH, capitalUsed: sum(o => o.capitalUsed), ordersUsed: sum(o => o.ordersUsed), orderSlots: slots,
      forgeSlotsUsed: sum(o => o.forgeSlotsUsed), forgeSlots: fSlots, limitCoinsDay: sum(o => o.limitCoinsH) * s.hoursPerDay,
      dailyLimit: s.dailyLimit, activeMinutesH: sum(o => o.activeSecondsH) / 60,
      coinsDay: coinsH * s.hoursPerDay, usage, limitedBy,
    },
  };
}
