// One evaluation engine for every flip type. A Route is: buy legs -> processing steps -> sell leg, all per ONE
// sold output unit. evaluate() turns a route into an Opportunity with coins/hour, what limits it, capital, daily
// bazaar-limit use, time spent clicking, requirements and a step-by-step explanation.
import { BAZAAR, limitContribution, npcBuyLimit, orderSlots, taxRate, FORGE, forgeSlots, type Profile, type Requirement, dedupeRequirements, unmet, actionSeconds, type TimingSettings } from "../rules/index.js";
import { type FillModel, at, curve } from "../fill/index.js";

export interface Settings extends TimingSettings {
  coins: number;
  bazaarFlipperLevel: number;   // 0..2 -> order slots 14/21/28 and tax 1.25/1.125/1%
  checkIntervalMin: number;     // how often you look at your orders
  hoursPerDay: number;          // how long you flip per day (for the daily bazaar limit)
  dailyLimit: number;           // coins/day counted by Hypixel (community value 15B)
  attention: number;            // share of each hour you can spend clicking (0..1)
  craftsPerHourMax: number;     // your manual crafting speed cap
  unknownCompetitionShare: number; // time-on-top assumed when we have no undercut data
  minUnitsPerHour: number;
  includeFlagged: boolean;
  /** false (default): a route with a buy order and a sell offer runs one trade at a time (buy the batch, then sell it),
   *  as a single trade really does; true: you keep buying the next batch while the last one is on sale */
  overlapOrders: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  coins: 100_000_000, bazaarFlipperLevel: 0, checkIntervalMin: 5, hoursPerDay: 4, dailyLimit: BAZAAR.dailyLimitDefault,
  attention: 0.8, craftsPerHourMax: 1000, unknownCompetitionShare: 0.5, minUnitsPerHour: 0, includeFlagged: false, overlapOrders: false,
  pingMs: 80, clickDelayMs: 350, typingMs: 1500,
};

export type BuyMode = "instant" | "order";
export type SellMode = "instant" | "offer";

export interface BuyLeg {
  item: string;
  name: string;
  qty: number;             // per output unit
  mode: BuyMode | "npc" | "ah" | "fee"; // npc: an NPC shop's fixed price; ah: the lowest BIN on the auction house; fee: coins paid for a
                           // service (Kat); none of them uses the bazaar (no daily limit, no order slots)
  source?: string;         // npc: who sells it
  price: number;           // coins per input unit
  flowH: number;           // units/h you can obtain (instant: sellers' flow; order: your share of instant sells)
  share: number | null;    // time on top for order legs
  undercutsH: number | null; // how often the best price is beaten (order legs)
  fill?: FillModel;        // order legs: measured time-on-top samples
  maxQty?: number;         // order legs: largest single order
  rateScale?: number;      // order legs: fill rate correction from paper trading (1 = the model as measured)
}

export interface ProcessStep {
  type: "craft" | "combine" | "forge" | "kat" | "fuse"; // kat: Kat raises a pet one rarity (one pet at a time); fuse: Fusion Machine
  label: string;
  opsPerUnit: number;      // operations per output unit
  forgeSeconds?: number;   // per operation, passive (forge, Kat)
  outputPerOp: number;
  requirements: Requirement[];
}

export interface SellLeg {
  item: string;
  name: string;
  mode: SellMode | "ah_reference" | "npc"; // npc: sold to an NPC shop at its fixed price (no bazaar tax, 500M coins/day cap)
  grossPrice: number;      // per unit before tax
  netPrice: number;        // after tax
  currentPrice?: number;   // the price right now, when it is above the typical price used instead
  priceBasis?: string;
  flowH: number;
  share: number | null;
  undercutsH: number | null;
  fill?: FillModel;
  maxQty?: number;
  rateScale?: number;     // fill rate correction from paper trading (1 = the model as measured)
}

export interface Route {
  kind: "bazaar" | "craft" | "book" | "forge" | "npc" | "kat" | "fusion";
  key: string;
  title: string;
  outputId: string;
  buys: BuyLeg[];
  steps: ProcessStep[];
  sell: SellLeg;
  requirements: Requirement[];
  flags: string[];
  notes: string[];
}

export interface Cap { name: string; unitsH: number; why: string }

/** One order leg of a route, sized for the rate the route actually runs at. */
export interface OrderPlanLeg {
  side: "buy" | "sell";
  item: string;
  name: string;
  price: number;
  qty: number;              // units per order
  parallel: number;         // orders at once at the same price (a batch above 71,680 units needs several)
  maxQty: number;
  ordersH: number;          // orders created per hour played (first post + every relist)
  unitsH: number;           // units this leg moves per hour played
  perOrder: number;         // units filled per order on average
  fullShare: number;        // share of orders filled completely before being beaten
  onTop: number;            // share of the time your order is the best price
  limitCoinsH: number;      // daily-limit coins per hour from creating these orders
  freeOrdersH: number;      // sell offers made with "Flip Order" (do not count toward the limit)
  coinsLocked: number;      // coins sitting in the order (buy) or stock sitting in the offer (sell, at cost)
  basis: "measured" | "estimated";
  hold: { n: number; hours: number; p50: number | null; p90: number | null; beatenFast: number; flowPerMin: number } | null;
  /** what other sizes would do for this leg alone */
  options: { qty: number; unitsH: number; ordersH: number; perOrder: number; limitCoinsH: number }[];
}

export interface Opportunity extends Route {
  costPerUnit: number;
  profitPerUnit: number;
  marginPct: number;
  unitsH: number;
  coinsH: number;
  limitedBy: string;
  caps: Cap[];
  capitalAllocated: number;
  capitalUsed: number;
  ordersUsed: number;
  forgeSlotsUsed: number;
  limitCoinsH: number;      // coins/h counted toward the daily bazaar limit
  limitHoursLeft: number;   // hours/day this alone could run before hitting the limit
  activeSecondsH: number;   // clicking time per hour at this rate
  orderPlan: OrderPlanLeg[];
  /** output units per round: every buy order is batch x (recipe amount), the sell offer is batch */
  batch: number;
  /** coins cover one batch only: buy, then sell, then buy again (slower than keeping a buy order up while selling) */
  oneAtATime: boolean;
  /** order routes: the fill model's hours to fill one batch on each side, before the paper-trading correction */
  batchHours?: { buy: number; sell: number } | null;
  batchOptions: { batch: number; unitsH: number; coinsH: number; limitCoinsH: number; capital: number; clickMinH: number; limitedBy: string; oneAtATime: boolean }[];
  instantLimitCoinsH: number; // daily-limit coins per hour from instant buys / sells
  npcSellCoinsH: number;      // coins/h earned selling to NPC shops (they pay at most 500M coins per profile per day)
  unmet: Requirement[];
  explain: string[];
}

/** Share of time your order is the best one: T / (T + check/2), T = minutes until someone beats you. */
export function shareOnTop(undercutsH: number | null, s: Settings): number | null {
  if (undercutsH == null) return null;
  if (undercutsH <= 0) return 1;
  const t = 60 / undercutsH;
  return t / (t + s.checkIntervalMin / 2);
}

// one formatter per precision: Number#toLocaleString with options builds a new formatter on every call (that alone was
// most of the calculation time)
const fmts = new Map<number, Intl.NumberFormat>();
const fmt = (v: number, d = 1) => { let f = fmts.get(d); if (!f) fmts.set(d, (f = new Intl.NumberFormat("en-US", { maximumFractionDigits: d }))); return f.format(v); };

/** `capital`: coins this route may use. A single route on its own gets all your coins; the planner passes what is left. */
export function evaluate(route: Route, s: Settings, p: Profile, capital = s.coins,
  limits?: { activeSecondsH?: number; limitCoinsDay?: number; forgeSlots?: number; npcSellCoinsDay?: number }): Opportunity {
  const explain: string[] = [];
  const tax = taxRate(s.bazaarFlipperLevel, p.quadTaxes);
  const costPerUnit = route.buys.reduce((a, b) => a + b.qty * b.price, 0);
  const profitPerUnit = route.sell.netPrice - costPerUnit;
  for (const b of route.buys)
    explain.push(b.mode === "fee" ? `Per ${route.sell.name}: ${b.name} ${fmt(b.qty * b.price)}`
      : `Per ${route.sell.name} sold: ${b.mode === "order" ? "buy order" : b.mode === "npc" ? `NPC shop (${b.source ?? "NPC"})` : b.mode === "ah" ? "auction house (lowest BIN)" : "instant buy"} ${fmt(b.qty, 3)}x ${b.name} at ${fmt(b.price)} = ${fmt(b.qty * b.price)}`);
  for (const st of route.steps) explain.push(`${st.label}: ${fmt(st.opsPerUnit, 3)} operation(s) per unit`);
  if (route.sell.mode === "npc") explain.push(`Sell ${route.sell.name} to an NPC shop at ${fmt(route.sell.grossPrice)} (no bazaar tax)`);
  else if (route.sell.mode === "ah_reference") explain.push(`Sell ${route.sell.name} on the auction house as a BIN at ${fmt(route.sell.grossPrice)} (the ${route.sell.priceBasis ?? "lowest BIN"}) = ${fmt(route.sell.netPrice)} kept`);
  else explain.push(`${route.sell.mode === "offer" ? "Sell offer" : route.sell.mode === "instant" ? "Instant sell" : "AH reference price"} ${route.sell.name} at ${fmt(route.sell.grossPrice)} - ${(tax * 100).toFixed(3)}% tax = ${fmt(route.sell.netPrice)}`);
  if (route.sell.currentPrice != null)
    explain.push(`Sale priced at the ${route.sell.priceBasis}: right now it is listed at ${fmt(route.sell.currentPrice)} (${((route.sell.currentPrice / route.sell.grossPrice - 1) * 100).toFixed(0)}% higher), which buyers are unlikely to pay by the time you sell`);
  explain.push(`Profit per unit = ${fmt(route.sell.netPrice)} - ${fmt(costPerUnit)} = ${fmt(profitPerUnit)}`);

  const caps: Cap[] = [];
  for (const b of route.buys) if (b.mode !== "fee")
    caps.push({ name: `${b.name} supply`, unitsH: b.flowH / b.qty,
      why: b.mode === "ah" ? `~${fmt(b.flowH, 2)}/h sold on the auction house (last 24 h): about as many as you can expect to find listed`
        : b.mode === "order" ? `your buy orders fill ~${fmt(b.flowH)}/h (${b.share == null ? "competition unknown" : `on top ${(b.share * 100).toFixed(0)}%`})`
        : b.mode === "npc" ? `NPC shops sell at most ${npcBuyLimit(p.npcShoppingSpree)}/day per item = ${fmt(b.flowH)}/h over your ${s.hoursPerDay} h` : `sellers list ~${fmt(b.flowH)}/h` });
  caps.push({ name: `${route.sell.name} demand`, unitsH: route.sell.flowH,
    why: route.sell.mode === "offer" ? `your sell offers fill ~${fmt(route.sell.flowH)}/h (${route.sell.share == null ? "competition unknown" : `on top ${(route.sell.share * 100).toFixed(0)}%`})` : `buyers take ~${fmt(route.sell.flowH)}/h` });

  // NPC shops pay out at most 500M coins per profile per day (whatever the planner's other NPC picks leave)
  if (route.sell.mode === "npc") {
    const day = limits?.npcSellCoinsDay ?? BAZAAR.npcDailySellCoins;
    caps.push({ name: "NPC sell cap", unitsH: Math.max(0, day) / Math.max(1e-9, route.sell.grossPrice) / Math.max(0.1, s.hoursPerDay),
      why: `NPC shops pay out at most ${fmt(BAZAAR.npcDailySellCoins / 1e6, 0)}M coins a day${day < BAZAAR.npcDailySellCoins ? ` (${fmt(Math.max(0, day) / 1e6, 0)}M left after your other NPC sales)` : ""}, spread over your ${s.hoursPerDay} h` });
  }

  // crafting speed
  const craftOps = route.steps.filter(x => x.type === "craft").reduce((a, x) => a + x.opsPerUnit, 0);
  if (craftOps > 0) caps.push({ name: "your crafting speed", unitsH: s.craftsPerHourMax / craftOps, why: `${s.craftsPerHourMax} crafts/h max` });

  // forge slots (and Kat, who cares for one pet at a time): a slot keeps working while you are offline, but only on the
  // process you started before logging off. Per slot per day: the runs that fit in your playing hours, plus that one,
  // and never more than 24 h allows.
  let forgeSlotsUsed = 0;
  const hoursPlayed = Math.max(0.1, s.hoursPerDay);
  // whole runs only: you start a run when you log in and each time one finishes while you play; the last one you start
  // finishes while you are away. (Counting fractions of a run overstated a 10 h forge by 40%.)
  const runsPerSlot = (dH: number) => Math.min(Math.floor(24 / dH + 1e-9), Math.floor(hoursPlayed / dH + 1e-9) + 1);
  for (const st of route.steps.filter(x => x.type === "kat")) {
    const dH = Math.max(1 / 3600, (st.forgeSeconds ?? 1) / 3600), runs = runsPerSlot(dH);
    caps.push({ name: "Kat (one pet at a time)", unitsH: runs / Math.max(1e-9, st.opsPerUnit) / hoursPlayed,
      why: `${fmt(runs, 1)} upgrades/day (${fmt(dH, 2)} h each: what fits in your ${hoursPlayed} h of play, plus one started before you log off)` });
  }
  for (const st of route.steps.filter(x => x.type === "forge")) {
    // your forge slots from your HotM tier; if you have not set it, the minimum that unlocks the Forge (and it says so)
    const own = forgeSlots(p.hotmTier), slots = limits?.forgeSlots ?? (own || forgeSlots(FORGE.minHotm));
    forgeSlotsUsed = slots;
    const dH = Math.max(1 / 3600, (st.forgeSeconds ?? 1) / 3600);
    const runsPerSlotDay = runsPerSlot(dH);
    caps.push({ name: "forge slots", unitsH: (slots * runsPerSlotDay * st.outputPerOp) / Math.max(1e-9, st.opsPerUnit * st.outputPerOp) / hoursPlayed,
      why: `${slots} slots${!own && limits?.forgeSlots == null ? ` (assumed: HotM ${FORGE.minHotm}, set your HotM tier)` : ""} x ${fmt(runsPerSlotDay, 1)} runs/day each (${fmt(dH, 2)} h per run: what fits in your ${hoursPlayed} h of play, plus one started before you log off)` });
  }

  // Everything below depends on the batch size B and the rate U (output units per hour played). A route runs in
  // batches: one buy order per ingredient for B x (recipe amount), and one sell offer for B. Buying 4 and offering 8
  // is impossible, so every order leg uses the SAME batch. Within a batch size, the daily limit and clicking time grow
  // with U; coins grow with B.
  const hours = Math.max(0.1, s.hoursPerDay);
  const checkMin = s.checkIntervalMin;
  const forgeHoldH = route.steps.filter(x => x.type === "forge" || x.type === "kat").reduce((a, x) => a + (x.forgeSeconds ?? 0) / 3600, 0);
  const stepSec = route.steps.reduce((a, st) => a + st.opsPerUnit * (st.type === "craft" ? actionSeconds("craft", s) : st.type === "combine" ? actionSeconds("anvil_combine", s)
    : st.type === "kat" ? actionSeconds("kat_start", s) + actionSeconds("kat_claim", s) : st.type === "fuse" ? actionSeconds("shard_fuse", s) : actionSeconds("forge_start", s) + actionSeconds("forge_claim", s)), 0);
  const ordersUsed = route.buys.filter(b => b.mode === "order").length + (route.sell.mode === "offer" ? 1 : 0);

  const valid = caps.filter(c => Number.isFinite(c.unitsH));
  // the forge cap above is already per hour played (it includes the run that finishes while you are offline)
  // order legs are re-capped below at the chosen batch; everything else (instant legs, crafting, forge) caps here
  const nonOrder = valid.filter(c => !route.buys.some(b => b.mode === "order" && c.name === `${b.name} supply`) && !(route.sell.mode === "offer" && c.name === `${route.sell.name} demand`));
  const market = nonOrder.reduce((a, c) => (c.unitsH < a.unitsH ? c : a), { name: "none", unitsH: Infinity, why: "" } as Cap);

  interface OL { side: "buy" | "sell"; item: string; name: string; price: number; perUnit: number; lock: number; fill: FillModel; maxQty: number; c: ReturnType<typeof curve>; raw: ReturnType<typeof curve>; scale: number }
  // fills at the model's rate, corrected by what paper trades of the item measured (rateScale, from fill/calibration.ts)
  const scaled = (c: ReturnType<typeof curve>, k: number) => (k === 1 ? c : c.map(p => ({ ...p, unitsH: p.unitsH * k })));
  const legsOL: OL[] = [];
  for (const b of route.buys) if (b.mode === "order" && b.fill)
    legsOL.push({ side: "buy", item: b.item, name: b.name, price: b.price, perUnit: b.qty, lock: b.price, fill: b.fill, maxQty: b.maxQty ?? BAZAAR.maxUnitsPerOrder,
      raw: curve(b.fill, checkMin), c: scaled(curve(b.fill, checkMin), b.rateScale ?? 1), scale: b.rateScale ?? 1 });
  if (route.sell.mode === "offer" && route.sell.fill)
    legsOL.push({ side: "sell", item: route.sell.item, name: route.sell.name, price: route.sell.grossPrice, perUnit: 1, lock: costPerUnit, fill: route.sell.fill, maxQty: route.sell.maxQty ?? BAZAAR.maxUnitsPerOrder,
      raw: curve(route.sell.fill, checkMin), c: scaled(curve(route.sell.fill, checkMin), route.sell.rateScale ?? 1), scale: route.sell.rateScale ?? 1 });
  const bMax = legsOL.length ? Math.max(1, Math.floor(Math.min(...legsOL.map(l => l.maxQty / l.perUnit)))) : 1;

  /** Coins sitting in the forge: the inputs of the runs in progress. At most every slot is busy at once, each holding
   *  one run's inputs (cost per output unit / output units per run). U is per hour PLAYED, so busy slots = runs needed
   *  per day / runs one slot does per day. */
  const forgeCapital = (U: number) => {
    let c = 0;
    for (const st of route.steps) if ((st.type === "forge" || st.type === "kat") && U > 0) {
      const dH = Math.max(1 / 3600, (st.forgeSeconds ?? 1) / 3600);
      const busy = Math.min(st.type === "kat" ? 1 : forgeSlotsUsed || 1, (U * hoursPlayed * st.opsPerUnit) / runsPerSlot(dH));
      c += busy * (costPerUnit / Math.max(1e-9, st.opsPerUnit));
    }
    return c;
  };
  /** `seq`: one batch at a time (buy, then sell, then buy again): coins only ever hold one side of the batch. */
  const usageAt = (B: number, U: number, seq = false) => {
    let limitH = 0, instantLimitH = 0, clickS = U * stepSec, capitalNow = forgeCapital(U), fullBuysH = 0, buyLock = 0, sellLock = 0;
    const legs: OrderPlanLeg[] = [];
    for (const l of legsOL) {
      // more than 71,680 units of one item per batch needs several orders at the same price (one slot each)
      const total = Math.max(1, Math.round(B * l.perUnit));
      const parallel = Math.ceil(total / l.maxQty), qty = Math.ceil(total / parallel);
      const pt = at(l.c, total);
      const need = U * l.perUnit;
      const ordersH = pt.unitsH > 0 ? pt.ordersH * Math.min(1, need / pt.unitsH) : 0;
      // a completely filled buy order of the same item becomes the sell offer with "Flip Order", which Hypixel does
      // not count toward the limit; only bazaar flips (same item in and out) can do that
      const free = l.side === "sell" && route.kind === "bazaar" ? Math.min(ordersH, fullBuysH) : 0;
      const lim = (ordersH - free) * parallel * limitContribution(qty * l.price);
      if (l.side === "buy") fullBuysH += ordersH * pt.fullShare;
      limitH += lim;
      clickS += ordersH * parallel * actionSeconds(l.side === "buy" ? "relist_buy_order" : "relist_sell_offer", s);
      if (l.side === "buy") buyLock += total * l.lock; else sellLock += total * l.lock;
      const st = l.fill.stats;
      legs.push({ side: l.side, item: l.item, name: l.name, price: l.price, qty, parallel, maxQty: l.maxQty, ordersH, unitsH: need,
        perOrder: pt.ordersH > 0 ? pt.unitsH / pt.ordersH : 0, fullShare: pt.fullShare, onTop: pt.onTop, limitCoinsH: lim, freeOrdersH: free,
        coinsLocked: total * l.lock, basis: l.fill.basis, options: [],
        hold: st ? { n: st.n, hours: st.hours, p50: st.p50, p90: st.p90, beatenFast: st.beatenFast, flowPerMin: st.flowPerMin } : null });
    }
    for (const b of route.buys) {
      if (b.mode === "order" && b.fill) continue;
      if (b.mode === "npc") clickS += ((U * b.qty) / 64) * actionSeconds("npc_buy", s); // NPC purchases do not count toward the bazaar limit
      else if (b.mode === "ah") clickS += U * b.qty * actionSeconds("ah_buy", s); // auction-house purchases do not count toward it either
      else if (b.mode === "fee") continue;
      else {
        instantLimitH += U * b.qty * b.price;
        clickS += ((U * b.qty) / BAZAAR.maxInstantBuyUnits) * actionSeconds("instant_buy", s);
      }
    }
    if (route.sell.mode === "npc") clickS += (U / 64) * actionSeconds("npc_sell", s); // NPC sales do not count toward the bazaar limit
    if (route.sell.mode === "ah_reference") clickS += U * actionSeconds("ah_sell", s); // one BIN listing per item
    if (route.sell.mode === "instant") {
      instantLimitH += U * route.sell.grossPrice; // pre-tax value counts
      clickS += (U / BAZAAR.maxInstantBuyUnits) * actionSeconds("instant_sell", s);
    }
    capitalNow += seq ? Math.max(buyLock, sellLock) : buyLock + sellLock;
    // instant-only routes still hold about one check interval of stock between buying and selling, and at least one
    // whole unit (you cannot buy a fraction of a book)
    if (!legsOL.length && U > 0) capitalNow += Math.max(costPerUnit, U * costPerUnit * (checkMin / 60));
    return { limitH: limitH + instantLimitH, instantLimitH, clickS, capital: capitalNow, legs };
  };

  const limitBudgetH = (limits?.limitCoinsDay ?? s.dailyLimit) / hours;
  const activeBudget = Math.min(3600 * s.attention, limits?.activeSecondsH ?? Infinity);
  /** Best rate for one batch size: the slowest order leg or other cap, then the limit, clicking and coin budgets. */
  type By = { name: string; why: () => string };
  const hasBuyOrder = legsOL.some(l => l.side === "buy"), hasSellOffer = legsOL.some(l => l.side === "sell");
  // a trade buys its batch, then sells it: unless you keep buying while selling (overlapOrders), the rate is one trade
  // at a time (paper trading 2026-10-04: trades took 3.6x the predicted time when the buy and sell legs were assumed to
  // run side by side)
  const oneTrade = !s.overlapOrders && hasBuyOrder && hasSellOffer;
  const run = (B: number, seqIn = false): { B: number; U: number; by: By; seq: boolean } => {
    const seq = seqIn || oneTrade;
    let U = Number.isFinite(market.unitsH) ? Math.max(0, market.unitsH) : Infinity;
    let by: By = { name: market.name, why: () => market.why };
    let buyRate = Infinity, sellRate = Infinity;
    for (const l of legsOL) {
      const total = Math.max(1, Math.round(B * l.perUnit)), pt = at(l.c, total), r = pt.unitsH / l.perUnit;
      if (l.side === "buy") buyRate = Math.min(buyRate, r); else sellRate = Math.min(sellRate, r);
      if (r < U) { U = r; by = { name: `${l.name} ${l.side === "buy" ? "supply" : "demand"}`,
        why: () => `${l.side === "buy" ? "buy orders" : "sell offers"} of ${fmt(total, 0)}: on top ${(pt.onTop * 100).toFixed(0)}% of the time, ~${fmt(pt.unitsH, 1)} filled/h (${l.fill.basis})` }; }
    }
    // one batch at a time: fill the buy orders, then sell the batch, then buy again (BazaarNotifier's sequential model)
    if (seq && Number.isFinite(buyRate) && Number.isFinite(sellRate) && buyRate > 0 && sellRate > 0) {
      const r = 1 / (1 / buyRate + 1 / sellRate);
      if (r < U) { U = r; by = { name: "one batch at a time", why: () => `${seqIn ? "your coins cover one batch, not a buy order and unsold stock together" : "one trade at a time (setting: keep buying while selling is off)"}: buy ${fmt(B, 0)} (~${fmt(B / buyRate * 60, 0)} min), then sell them (~${fmt(B / sellRate * 60, 0)} min), then buy again` }; }
    }
    if (!Number.isFinite(U)) U = 0;
    // with a fixed batch, relists, clicks and limit use all grow in proportion to the rate
    const u0 = usageAt(B, U, seq);
    const kLimit = u0.limitH > limitBudgetH ? limitBudgetH / u0.limitH : 1, kClick = u0.clickS > activeBudget ? activeBudget / u0.clickS : 1;
    if (U > 0 && Math.min(kLimit, kClick) < 1) {
      if (kLimit <= kClick) by = { name: "daily bazaar limit", why: () => `${fmt(s.dailyLimit / 1e9, 1)}B/day over ${hours} h = ${fmt(limitBudgetH / 1e6, 0)}M/h` };
      else by = { name: "your clicking time", why: () => `${fmt(activeBudget / 60)} min/h of clicking (relists, claims, crafts)` };
      U *= Math.min(kLimit, kClick);
    }
    const fixed = legsOL.length ? usageAt(B, 0, seq).capital : costPerUnit;
    if (fixed > capital) {
      if (!seq && hasBuyOrder && hasSellOffer) return run(B, true);
      return { B, U: 0, seq, by: { name: "your coins", why: () => `one batch of ${fmt(B, 0)} needs ${fmt(fixed, 0)} coins${seq ? "" : " in orders and stock"}; you have ${fmt(capital, 0)}` } };
    }
    const withU = usageAt(B, U, seq).capital;
    if (withU > capital && U > 0) { U = U * ((capital - fixed) / (withU - fixed)); by = { name: "your coins", why: () => `${fmt(capital, 0)} coins` }; }
    return { B, U: Math.max(0, U), by, seq };
  };
  const grid: number[] = [];
  if (legsOL.length) {
    for (let k = 0; k <= 40; k++) { const v = Math.round(bMax ** (k / 40)); if (!grid.includes(v)) grid.push(v); }
    // the largest batch your coins cover in each mode is where the best rate usually sits when coins are the limit:
    // a spaced-out grid (…9, 11…) can step right over it (Stock of Stonks: 10 fits 100M side by side, 11 does not)
    for (const seq of [false, true]) {
      const perBatch = usageAt(1, 0, seq).capital;
      if (perBatch > 0) { const b = Math.floor(capital / perBatch); for (const v of [b - 1, b, b + 1]) if (v >= 1 && v <= bMax && !grid.includes(v)) grid.push(v); }
    }
    grid.sort((a, b) => a - b);
  } else grid.push(1);
  const runs = grid.map(b => run(b));
  let top = runs.reduce((a, r) => (r.U > a.U ? r : a), runs[0]!);
  // refine: try every whole batch between the grid neighbours of the best one (at most 60 extra evaluations)
  if (legsOL.length && top.U > 0) {
    const i = grid.indexOf(top.B), lo = grid[Math.max(0, i - 1)]!, hi = grid[Math.min(grid.length - 1, i + 1)]!;
    const step = Math.max(1, Math.ceil((hi - lo) / 60));
    for (let b = lo; b <= hi; b += step) if (!grid.includes(b)) { const r = run(b); runs.push(r); if (r.U > top.U) top = r; }
    runs.sort((a, b) => a.B - b.B);
  }
  // the smallest batch that gets (almost) the best rate: less money tied up, less limit used per relist
  const chosen = runs.find(r => r.U >= top.U * 0.995) ?? top;
  const U = chosen.U, best: Cap = { name: chosen.by.name, unitsH: chosen.U, why: chosen.by.why() };
  const use = usageAt(chosen.B, U, chosen.seq);
  const batchOptions = [...new Set([Math.ceil(chosen.B / 4), Math.ceil(chosen.B / 2), chosen.B, chosen.B * 2, chosen.B * 4, bMax].map(b => Math.max(1, Math.min(bMax, b))))]
    .map(b => { const r = run(b), u = usageAt(b, r.U, r.seq); return { batch: b, unitsH: r.U, coinsH: r.U * profitPerUnit, limitCoinsH: u.limitH, capital: u.capital, clickMinH: u.clickS / 60, limitedBy: r.by.name, oneAtATime: r.seq }; });
  use.legs.forEach((l, i) => { l.options = batchOptions.map(o => { const lu = usageAt(o.batch, o.unitsH, o.oneAtATime).legs[i]!; return { qty: lu.qty, unitsH: lu.unitsH, ordersH: lu.ordersH, perOrder: lu.perOrder, limitCoinsH: lu.limitCoinsH }; }); });
  // budget rows for the "what limits it" table
  caps.length = 0;
  caps.push(...nonOrder);
  for (const l of use.legs) caps.push({ name: `${l.name} ${l.side === "buy" ? "supply" : "demand"}`, unitsH: at(legsOL.find(x => x.item === l.item && x.side === l.side)!.c, l.qty).unitsH / (legsOL.find(x => x.item === l.item && x.side === l.side)!.perUnit),
    why: `${l.side === "buy" ? "buy orders" : "sell offers"} of ${fmt(l.qty, 0)}, on top ${(l.onTop * 100).toFixed(0)}% of the time (${l.basis})` });
  const head = (used: number, max: number) => (used > 0 ? U * (max / used) : Infinity);
  caps.push({ name: "daily bazaar limit", unitsH: best.name === "daily bazaar limit" ? U : head(use.limitH, limitBudgetH), why: `${fmt(use.limitH / 1e6, 1)}M/h of ${fmt(limitBudgetH / 1e6, 0)}M/h (orders count their full value when created, relists again, instant trades their value)` });
  caps.push({ name: "your clicking time", unitsH: best.name === "your clicking time" ? U : head(use.clickS, activeBudget), why: `${fmt(use.clickS / 60)} of ${fmt(activeBudget / 60)} min/h: relisting when beaten, claiming, crafting (ping ${s.pingMs} ms)` });
  caps.push({ name: "your coins", unitsH: best.name === "your coins" ? U : head(use.capital, capital), why: `${fmt(use.capital, 0)} of ${fmt(capital, 0)} coins: ${chosen.seq ? "one batch at a time (buy, then sell)" : "money in buy orders + stock in sell offers"}${forgeHoldH ? " + inputs in the forge" : ""}` });
  const unitsH = U;
  const coinsH = unitsH * profitPerUnit;
  if (legsOL.length) explain.push(`Runs in batches of ${fmt(chosen.B, 0)}${chosen.seq ? ", one batch at a time" : ""}: ${use.legs.map(l => `${l.side === "buy" ? "buy order" : "sell offer"} ${l.parallel > 1 ? `${l.parallel} x ` : ""}${fmt(l.qty, 0)}x ${l.name}`).join(", ")}`);
  for (const l of use.legs)
    explain.push(`${l.side === "buy" ? "Buy order" : "Sell offer"} ${l.name}: ${fmt(l.qty, 0)} per order, ~${fmt(l.ordersH, 1)} orders/h, ~${fmt(l.perOrder, 1)} filled per order, on top ${(l.onTop * 100).toFixed(0)}% of the time (${l.basis === "measured" ? `measured from ${l.hold?.n ?? 0} top-of-book episodes` : "estimated: not enough live data yet"})`);
  // the model's own time for one batch, before the paper-trading correction: what paper trades are compared with
  const rawLegH = (side: "buy" | "sell") => {
    let h = 0;
    for (const l of legsOL) if (l.side === side) {
      const r = at(l.raw, Math.max(1, Math.round(chosen.B * l.perUnit))).unitsH / l.perUnit;
      if (r > 0) h = Math.max(h, chosen.B / r);
    }
    return h;
  };
  const batchHours = legsOL.length ? { buy: rawLegH("buy"), sell: rawLegH("sell") } : null;
  const corrected = legsOL.filter(l => l.scale !== 1);
  if (corrected.length) explain.push(`Fill speed corrected by paper trading: ${corrected.map(l => `${l.side === "buy" ? "buy orders" : "sell offers"} of ${l.name} fill at ${Math.round(l.scale * 100)}% of the model's speed`).join(", ")}`);
  explain.push(`Units per hour played = ${fmt(unitsH, 2)} (limited by ${best.name}: ${best.why}); ${fmt(unitsH * hours, 1)} units/day over ${hours} h`);
  explain.push(`Coins/h = ${fmt(unitsH, 2)} x ${fmt(profitPerUnit)} = ${fmt(coinsH, 0)}${profitPerUnit <= 0 ? " (this route loses money at current prices)" : ""}`);
  const limitCoinsH = use.limitH;
  const reqs = dedupeRequirements(route.requirements);
  return {
    ...route, requirements: reqs, costPerUnit, profitPerUnit, marginPct: costPerUnit > 0 ? profitPerUnit / costPerUnit : 0,
    unitsH, coinsH, limitedBy: best.name, caps: caps.filter(c => Number.isFinite(c.unitsH)).sort((a, b) => a.unitsH - b.unitsH),
    capitalAllocated: capital, capitalUsed: use.capital, ordersUsed: ordersUsed + use.legs.reduce((a, l) => a + l.parallel - 1, 0), oneAtATime: chosen.seq, batchHours,
    // slots actually busy at this rate: runs needed per day / runs one slot does per day
    forgeSlotsUsed: unitsH > 0 && forgeSlotsUsed > 0 ? Math.min(forgeSlotsUsed, Math.ceil(Math.max(...route.steps.filter(x => x.type === "forge").map(x => {
      const dH = Math.max(1 / 3600, (x.forgeSeconds ?? 1) / 3600);
      return (unitsH * hoursPlayed * x.opsPerUnit) / runsPerSlot(dH);
    })) - 1e-9)) : 0,
    limitCoinsH, limitHoursLeft: limitCoinsH > 0 ? s.dailyLimit / limitCoinsH : Infinity,
    activeSecondsH: use.clickS, orderPlan: use.legs, instantLimitCoinsH: use.instantLimitH, npcSellCoinsH: route.sell.mode === "npc" ? unitsH * route.sell.grossPrice : 0, batch: chosen.B, batchOptions, unmet: unmet(reqs, p), explain,
  };
}
