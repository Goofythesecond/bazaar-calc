// Route builders for the four flip types plus the acquisition search they share.
import { BAZAAR, taxRate, npcBuyLimit, booksNeeded, combineXpCost, enchantRules, bookId, type EnchantRule, forgeDurationSeconds, type Profile, type Requirement } from "../rules/index.js";
import { prettyName, type BookLevel, TYPICAL_BAND, bookCeiling, buyFlowH, sellFlowH, seriousFlags, typicalPrice, type ItemMarket, type Market } from "../market/index.js";
import { type BuyLeg, type BuyMode, type Opportunity, type ProcessStep, type Route, type SellLeg, type SellMode, type Settings, evaluate } from "./engine.js";
import { type FillModel, curve, at, fillModel } from "../fill/index.js";
import type { Recipe } from "../recipes/index.js";

export interface Ctx {
  market: Market;
  recipes: Map<string, Recipe[]>;   // by output id
  settings: Settings;
  profile: Profile;
  names?: Map<string, string>;
  /** list every route, losing ones and flagged markets included (the flip tables); the planner leaves this off */
  listAll?: boolean;
  /** recipes / books that could not be priced, with the reason (filled while building routes) */
  skipped?: { kind: Route["kind"]; key: string; title: string; reason: string }[];
}

export const nameOf = (ctx: Ctx, id: string) => ctx.market.get(id)?.name ?? ctx.names?.get(id) ?? id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const allowed = (ctx: Ctx, m: ItemMarket | undefined): m is ItemMarket =>
  !!m && (ctx.settings.includeFlagged || !!ctx.listAll || seriousFlags(m).length === 0);
/** Both sides have orders (needed for a same-item bazaar flip). */
const usable = (ctx: Ctx, m: ItemMarket | undefined): m is ItemMarket => allowed(ctx, m) && m.ask != null && m.bid != null;
/** Instant buy needs sell offers to buy from; a buy order needs a best buy order to go 0.1 above. */
export const canBuy = (ctx: Ctx, m: ItemMarket | undefined, mode: BuyMode): m is ItemMarket => allowed(ctx, m) && (mode === "instant" ? m.ask != null : m.bid != null);
/** Instant sell needs buy orders to sell into; a sell offer needs a best sell offer to go 0.1 below. */
export const canSell = (ctx: Ctx, m: ItemMarket | undefined, mode: SellMode): m is ItemMarket => allowed(ctx, m) && (mode === "instant" ? m.bid != null : m.ask != null);
const sellable = (ctx: Ctx, m: ItemMarket | undefined) => canSell(ctx, m, "offer") || canSell(ctx, m, "instant");

/** Average price of taking `units` from the book (levels best-first); beyond the visible depth the worst level is used. */
export function walkBook(levels: BookLevel[] | undefined, units: number, fallback: number): number {
  if (!levels?.length || units <= 0) return fallback;
  let left = units, cost = 0;
  for (const l of levels) {
    const take = Math.min(left, l.amount);
    cost += take * l.price;
    left -= take;
    if (left <= 0) break;
  }
  if (left > 0) cost += left * levels[levels.length - 1]!.price;
  return cost / units;
}

/** Units taken per instant trade: one check interval of flow, at most one inventory-full instant buy. */
const instantBatch = (ctx: Ctx, qty: number, flowH: number) => Math.max(qty, Math.min(BAZAAR.maxInstantBuyUnits, (flowH * ctx.settings.checkIntervalMin) / 60));

const models = new WeakMap<ItemMarket, Map<string, FillModel>>();
/** Measured (or estimated) time-on-top model for one side of an item, memoised per market snapshot and settings. */
function modelFor(ctx: Ctx, m: ItemMarket, side: "bid" | "ask"): FillModel {
  let byKey = models.get(m);
  if (!byKey) models.set(m, (byKey = new Map()));
  const k = `${side}|${ctx.settings.checkIntervalMin}|${ctx.settings.unknownCompetitionShare}`;
  let f = byKey.get(k);
  if (!f) byKey.set(k, (f = side === "bid"
    ? fillModel(m.holdBid, buyFlowH(m), m.undercutBuyH, ctx.settings.checkIntervalMin, ctx.settings.unknownCompetitionShare)
    : fillModel(m.holdAsk, sellFlowH(m), m.undercutSellH, ctx.settings.checkIntervalMin, ctx.settings.unknownCompetitionShare)));
  return f;
}

/** Most a single order can hold: 71,680 units, and a sell offer is also capped at 1B coins of value. */
const maxOrderQty = (price: number, sell: boolean) => Math.max(1, Math.min(BAZAAR.maxUnitsPerOrder, sell ? Math.floor(BAZAAR.maxSellOfferValue / Math.max(price, 0.1)) : BAZAAR.maxUnitsPerOrder));

export function buyLeg(ctx: Ctx, m: ItemMarket, qty: number, mode: BuyMode): BuyLeg {
  if (mode === "instant") {
    const flow = sellFlowH(m);
    return { item: m.id, name: m.name, qty, mode, price: walkBook(m.topAsk, instantBatch(ctx, qty, flow), m.ask!), flowH: flow, share: null, undercutsH: null };
  }
  const fill = modelFor(ctx, m, "bid"), maxQty = maxOrderQty(m.bid! + 0.1, false);
  const top = at(curve(fill, ctx.settings.checkIntervalMin), maxQty);
  return { item: m.id, name: m.name, qty, mode, price: m.bid! + 0.1, flowH: top.unitsH, share: top.onTop, undercutsH: m.undercutBuyH, fill, maxQty };
}

export function sellLeg(ctx: Ctx, m: ItemMarket, mode: SellMode): SellLeg {
  const tax = taxRate(ctx.settings.bazaarFlipperLevel, ctx.profile.quadTaxes);
  // You sell after you buy (and craft), so a price pushed well above its typical level is not counted on: the sale is
  // priced at no more than 10% above the item's typical price from history (normal swings inside that band are kept).
  if (mode === "instant") {
    const flow = buyFlowH(m), now = walkBook(m.topBid, instantBatch(ctx, 1, flow), m.bid!), tb = typicalPrice(m, "bid");
    const gross = tb && TYPICAL_BAND * tb.price < now ? TYPICAL_BAND * tb.price : now;
    return { item: m.id, name: m.name, mode, grossPrice: gross, netPrice: gross * (1 - tax), flowH: flow, share: null, undercutsH: null,
      ...(gross < now ? { currentPrice: now, priceBasis: `typical buy order + 10% (${tb!.basis}, ${tb!.hours} h of history)` } : {}) };
  }
  const now = m.ask! - 0.1, ta = typicalPrice(m, "ask"), ceil = bookCeiling(ctx.market, m.id);
  let gross = ta && TYPICAL_BAND * ta.price - 0.1 < now ? TYPICAL_BAND * ta.price - 0.1 : now;
  let basis = ta && gross < now ? `typical sell offer + 10% (${ta.basis}, ${ta.hours} h of history), minus 0.1` : "";
  if (ceil && ceil.price - 0.1 < gross) { gross = ceil.price - 0.1; basis = `price of ${ctx.market.get(ceil.item)?.name ?? ceil.item} (a higher level costs less), minus 0.1`; }
  const fill = modelFor(ctx, m, "ask"), maxQty = maxOrderQty(gross, true);
  const top = at(curve(fill, ctx.settings.checkIntervalMin), maxQty);
  return { item: m.id, name: m.name, mode, grossPrice: gross, netPrice: gross * (1 - tax), flowH: top.unitsH, share: top.onTop, undercutsH: m.undercutSellH, fill, maxQty,
    ...(gross < now ? { currentPrice: now, priceBasis: basis } : {}) };
}

// ------------------------------------------------------------------ acquisition search
interface Acq { price: number; legs: BuyLeg[]; steps: ProcessStep[]; reqs: Requirement[]; how: "market" | "craft" }

const scale = (a: Acq, f: number): Acq => ({
  price: a.price * f, how: a.how, reqs: a.reqs,
  legs: a.legs.map(l => ({ ...l, qty: l.qty * f })), steps: a.steps.map(st => ({ ...st, opsPerUnit: st.opsPerUnit * f })),
});

function mergeLegs(legs: BuyLeg[]): BuyLeg[] {
  const by = new Map<string, BuyLeg>();
  for (const l of legs) {
    const k = `${l.item}|${l.mode}|${l.source ?? ""}`;
    const prev = by.get(k);
    by.set(k, prev ? { ...prev, qty: prev.qty + l.qty } : { ...l });
  }
  return [...by.values()];
}

/** Cheapest way to obtain ONE unit of `id`: buy it (instant / order) or craft it from parts (up to `maxDepth` levels). */
/**
 * `bonus`: extra crafting levels allowed only through items the bazaar does not sell at all (Stick <- planks <- logs),
 * so a craft flip is not lost just because one ingredient is two crafts away from anything on the bazaar.
 */
export function acquire(ctx: Ctx, id: string, mode: BuyMode, maxDepth = 2, seen = new Set<string>(), bonus = 1): Acq | null {
  let best: Acq | null = null;
  const m = ctx.market.get(id);
  if (canBuy(ctx, m, mode)) {
    const leg = buyLeg(ctx, m, 1, mode);
    best = { price: leg.price, legs: [leg], steps: [], reqs: [], how: "market" };
  }
  // NPC shops (coins only) price ingredients the bazaar does not sell at all. Items the bazaar does sell are never
  // bought from an NPC: that would turn a craft flip into an NPC flip, which this calculator does not do.
  const onBazaar = !!m && (m.ask != null || m.bid != null || m.ibuyWeek > 0 || m.isellWeek > 0);
  if (!onBazaar) for (const r of ctx.recipes.get(id) ?? []) {
    if (r.kind !== "npc") continue;
    const price = r.inputs[0]!.qty / r.outputCount;
    if (!best || price < best.price)
      best = { price, how: "market", steps: [], reqs: [],
        // NPC shops sell at most 640 of an item per player per day: spread over the hours you play
        legs: [{ item: id, name: nameOf(ctx, id), qty: 1, mode: "npc", source: r.source, price, flowH: npcBuyLimit(ctx.profile.npcShoppingSpree) / Math.max(0.1, ctx.settings.hoursPerDay), share: null, undercutsH: null }] };
  }
  const canCraft = maxDepth > 0 || (!onBazaar && !best && bonus > 0);
  if (canCraft && !seen.has(id)) {
    seen.add(id);
    for (const r of ctx.recipes.get(id) ?? []) {
      if (r.kind !== "crafting" || r.inputs.some(i => i.id === id)) continue;
      const parts: Acq[] = [];
      let ok = true;
      for (const inp of r.inputs) {
        const a = maxDepth > 0 ? acquire(ctx, inp.id, mode, maxDepth - 1, seen, bonus) : acquire(ctx, inp.id, mode, 0, seen, bonus - 1);
        if (!a) { ok = false; break; }
        parts.push(scale(a, inp.qty / r.outputCount));
      }
      if (!ok) continue;
      const price = parts.reduce((s, x) => s + x.price, 0);
      if (!best || price < best.price) {
        best = {
          price, how: "craft",
          legs: mergeLegs(parts.flatMap(x => x.legs)),
          steps: [...parts.flatMap(x => x.steps), { type: "craft", label: `Craft ${nameOf(ctx, id)}`, opsPerUnit: 1 / r.outputCount, outputPerOp: r.outputCount, requirements: r.requirements }],
          reqs: [...parts.flatMap(x => x.reqs), ...r.requirements],
        };
      }
    }
    seen.delete(id);
  }
  return best;
}

const MODES: [BuyMode, SellMode][] = [["order", "offer"], ["order", "instant"], ["instant", "offer"], ["instant", "instant"]];

/** Best route by coins/h, plus (if different) the best route that needs no order slots at all. */
/** The evidence behind "likely manipulated" for every item a route trades, so the route can say why. */
function manipulationNotes(ctx: Ctx, r: Route): string[] {
  const ids = new Set([...r.buys.map(b => b.item), r.sell.item]);
  return [...ids].flatMap(id => { const m = ctx.market.get(id); return m?.flagWhy?.likely_manipulated ? [`${m.name} looks manipulated: ${m.flagWhy.likely_manipulated}`] : []; });
}

export function bestOf(ctx: Ctx, routes: Route[]): Opportunity[] {
  let best: Opportunity | null = null, slotFree: Opportunity | null = null;
  for (const r0 of routes) {
    const extra = manipulationNotes(ctx, r0);
    const r = extra.length ? { ...r0, notes: [...r0.notes, ...extra] } : r0;
    const o = evaluate(r, ctx.settings, ctx.profile);
    const ok = o.profitPerUnit > 0 && o.unitsH > 0 && o.unitsH >= ctx.settings.minUnitsPerHour;
    if (!ok && !ctx.listAll) continue;
    if (!best || o.coinsH > best.coinsH) best = o;
    if (ok && o.ordersUsed === 0 && (!slotFree || o.coinsH > slotFree.coinsH)) slotFree = o;
  }
  const out = best ? [best] : [];
  if (slotFree && best && slotFree !== best) out.push({ ...slotFree, key: `${slotFree.key}:instant`, notes: [...slotFree.notes, "instant-only variant: uses no order slots"] });
  return out;
}

export const skip = (ctx: Ctx, kind: Route["kind"], key: string, title: string, reason: string) => { ctx.skipped?.push({ kind, key, title, reason }); };

// ------------------------------------------------------------------ bazaar flips (buy order -> sell offer, same item)
export function bazaarFlips(ctx: Ctx): Opportunity[] {
  const out: Opportunity[] = [];
  for (const m of ctx.market.values()) {
    if (!usable(ctx, m)) {
      // traded on one side only: a same-item flip needs both a buy order to beat and a sell offer to undercut
      const x: ItemMarket = m;
      if (x.ask != null || x.bid != null)
        skip(ctx, "bazaar", `bazaar:${x.id}`, x.name, x.ask == null ? "no sell offers right now (only buy orders): nothing to undercut when selling" : x.bid == null ? "no buy orders right now (only sell offers): nothing to outbid when buying" : `hidden by a market warning (${seriousFlags(x).join(", ")})`);
      continue;
    }
    const r: Route = {
      kind: "bazaar", key: `bazaar:${m.id}`, title: m.name, outputId: m.id,
      buys: [buyLeg(ctx, m, 1, "order")], steps: [], sell: sellLeg(ctx, m, "offer"),
      requirements: [], flags: m.flags, notes: [],
    };
    out.push(...bestOf(ctx, [r]));
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}

// ------------------------------------------------------------------ craft flips

/** Why an ingredient cannot be priced: not on the bazaar (or no prices) and no recipe made of priced parts. */
function missingInput(ctx: Ctx, inputs: { id: string }[], mode: BuyMode, outId: string): string | null {
  for (const inp of inputs) if (!acquire(ctx, inp.id, mode, 1, new Set([outId]))) {
    const m = ctx.market.get(inp.id);
    return m && (m.ask == null || m.bid == null) ? `${nameOf(ctx, inp.id)} has no ${m.ask == null ? "sell offers" : "buy orders"} on the bazaar right now`
      : m ? `${nameOf(ctx, inp.id)} is hidden by a market warning (${seriousFlags(m).join(", ")})`
      : `${nameOf(ctx, inp.id)} is not sold on the bazaar (NPC shop, drop or auction item) and has no recipe made of bazaar items`;
  }
  return null;
}

export function craftFlips(ctx: Ctx, opts: { includeAhOutputs?: boolean } = {}): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [outId, recipes] of ctx.recipes) {
    const m: ItemMarket | undefined = ctx.market.get(outId);
    const onBazaar = sellable(ctx, ctx.market.get(outId));
    const crafting = recipes.filter(r => r.kind === "crafting" && !r.inputs.some(i => i.id === outId));
    if (!crafting.length) continue;
    if (!onBazaar && !(opts.includeAhOutputs && m?.ahLowestBin)) {
      if (m?.ask != null || m?.bid != null || m?.ahLowestBin) skip(ctx, "craft", `craft:${outId}`, nameOf(ctx, outId),
        m?.ahLowestBin && !m.ask ? "sold on the auction house: turn on \"Auction-house outputs\" to price it from the lowest BIN"
          : m && (m.ask == null || m.bid == null) ? "no buy orders or no sell offers on the bazaar right now" : "hidden by a market warning");
      continue;
    }
    const routes: Route[] = [];
    let why: string | null = null;
    for (const r of crafting) {
      const subCrafted = new Set<string>();
      // depth 1: ingredients may be crafted from cheaper parts; depth 0: buy every ingredient as is. Cheaper parts can
      // mean hundreds of extra crafts per unit, so both are evaluated and the better coins/h wins.
      for (const depth of [1, 0]) for (const [bm, sm] of MODES) {
        const parts: Acq[] = [];
        let ok = true;
        for (const inp of r.inputs) {
          const a = acquire(ctx, inp.id, bm, depth, new Set([outId]));
          if (!a) { ok = false; break; }
          parts.push(scale(a, inp.qty / r.outputCount));
        }
        if (!ok) { why ??= missingInput(ctx, r.inputs, bm, outId); continue; }
        if (depth === 0 && !subCrafted.has(`${bm}`)) continue; // identical to the depth-1 route
        if (depth === 1 && parts.some(x => x.how === "craft")) subCrafted.add(`${bm}`);
        if (onBazaar ? !canSell(ctx, m, sm) : sm === "instant") continue; // AH output: one route per buy mode
        const sell: SellLeg = onBazaar ? sellLeg(ctx, m!, sm)
          : { item: outId, name: nameOf(ctx, outId), mode: "ah_reference", grossPrice: m!.ahLowestBin!, netPrice: m!.ahLowestBin!, flowH: (m!.ahSales24h ?? 0) / 24, share: null, undercutsH: null };
        routes.push({
          kind: "craft", key: `craft:${outId}`, title: nameOf(ctx, outId), outputId: outId,
          buys: mergeLegs(parts.flatMap(x => x.legs)),
          steps: [...parts.flatMap(x => x.steps), { type: "craft", label: `Craft ${nameOf(ctx, outId)}`, opsPerUnit: 1 / r.outputCount, outputPerOp: r.outputCount, requirements: r.requirements }],
          sell,
          requirements: [...parts.flatMap(x => x.reqs), ...r.requirements],
          flags: [...(onBazaar ? m!.flags : ["sold on the auction house: lowest BIN shown, AH fees not included"]),
            ...parts.flatMap(x => x.legs.flatMap(l => ctx.market.get(l.item)?.flags.map(f => `${l.name}: ${f}`) ?? []))].filter(f => !f.endsWith("low_history")),
          notes: r.outputCount > 1 ? [`one craft makes ${r.outputCount}`] : [],
        });
      }
    }
    if (!routes.length) { skip(ctx, "craft", `craft:${outId}`, nameOf(ctx, outId), why ?? "no recipe could be priced"); continue; }
    out.push(...bestOf(ctx, routes));
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}

// ------------------------------------------------------------------ book flips (buy low books, combine, sell high book)
export function bookFlips(ctx: Ctx): Opportunity[] {
  const out: Opportunity[] = [];
  for (const rule of Object.values(enchantRules()) as EnchantRule[]) {
    if (rule.combine_status !== "combinable" || !rule.combine_cap) {
      if ((rule.bazaar_levels?.length ?? 0) > 1) skip(ctx, "book", `book:${rule.id}`, rule.name, rule.combine_status === "no_combine"
        ? "these books cannot be combined to a higher level (the wiki marks the enchant as not combinable; it levels up by use)"
        : "the wiki gives no way to combine these books, so no route is shown");
      continue;
    }
    // a level counts if anyone trades it at all; each route then needs the side it actually uses
    const traded = (l: number) => { const m = ctx.market.get(bookId(rule.id, l)); return allowed(ctx, m) && (m.ask != null || m.bid != null); };
    const listed = (l: number) => ctx.market.has(bookId(rule.id, l));
    const levels: number[] = [];
    for (let l = 1; l <= (rule.max_level ?? rule.combine_cap); l++) if (traded(l)) levels.push(l);
    const targets = [...new Set([...levels, ...(rule.bazaar_levels ?? [])])].filter(t => t >= 2 && t <= rule.combine_cap! && listed(t)).sort((a, b) => a - b);
    if (!levels.length) {
      if ((rule.bazaar_levels?.length ?? 0) > 1) skip(ctx, "book", `book:${rule.id}`, rule.name, "no buy orders or sell offers for any level of this book on the bazaar right now");
      continue;
    }
    for (const t of targets) {
      const target = ctx.market.get(bookId(rule.id, t))!;
      const routes: Route[] = [];
      for (const s of levels) {
        const n = booksNeeded(rule, s, t);
        if (!n) continue;
        const src = ctx.market.get(bookId(rule.id, s))!;
        let xp = 0;
        for (let l = s; l < t; l++) xp = Math.max(xp, combineXpCost(rule, l));
        const reqs: Requirement[] = xp ? [{ type: "xp_levels", levels: xp, text: `${xp} XP levels to combine (${rule.name})` }] : [];
        for (const [bm, sm] of MODES) {
          if (!canBuy(ctx, src, bm) || !canSell(ctx, target, sm)) continue;
          routes.push({
            kind: "book", key: `book:${rule.id}_${t}`, title: `${prettyName(target.id)} from ${n}× ${prettyName(src.id)}`, outputId: target.id,
            buys: [buyLeg(ctx, src, n, bm)],
            steps: [{ type: "combine", label: `Combine ${n} ${prettyName(src.id)} into one ${prettyName(target.id)} (${n - 1} anvil uses, ${xp ? `${xp} XP` : "free"})`, opsPerUnit: n - 1, outputPerOp: 1, requirements: reqs }],
            sell: sellLeg(ctx, target, sm), requirements: reqs,
            flags: [...target.flags, ...src.flags.map(f => `level ${s}: ${f}`)].filter(f => !f.endsWith("low_history")),
            notes: [`combining cap ${rule.combine_cap} (${rule.url})`, ...(rule.enchanting_req ? [`applying it needs Enchanting ${rule.enchanting_req}`] : [])],
          });
        }
      }
      if (!routes.length) {
        const tm = ctx.market.get(bookId(rule.id, t));
        const lower = levels.filter(l => l < t);
        skip(ctx, "book", `book:${rule.id}_${t}`, prettyName(bookId(rule.id, t)),
          !traded(t) ? `nobody is buying or selling ${prettyName(bookId(rule.id, t))} on the bazaar right now`
            : !lower.length ? `no lower level of ${rule.name} has buy orders or sell offers to buy from`
              : `the levels that trade cannot be paired (${tm?.ask == null ? "no sell offers" : "no buy orders"} at level ${t})`);
        continue;
      }
      out.push(...bestOf(ctx, routes));
    }
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}

// ------------------------------------------------------------------ forge flips
export function forgeFlips(ctx: Ctx, opts: { includeAhOutputs?: boolean } = {}): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [outId, recipes] of ctx.recipes) {
    // every forge recipe of one output competes inside ONE row (two rows with the same key would collide)
    const forgeRecipes = recipes.filter(r => r.kind === "forge" && r.durationS);
    if (!forgeRecipes.length) continue;
    const m: ItemMarket | undefined = ctx.market.get(outId);
    const onBazaar = sellable(ctx, ctx.market.get(outId));
    if (!m || (!onBazaar && !(opts.includeAhOutputs && m.ahLowestBin))) {
      if (m) skip(ctx, "forge", `forge:${outId}`, nameOf(ctx, outId), m.ahLowestBin && m.ask == null ? "sold on the auction house: turn on \"Auction-house outputs\" to price it from the lowest BIN" : "no usable bazaar prices for the output right now");
      continue;
    }
    const routes: Route[] = [];
    let why: string | null = null;
    for (const r of forgeRecipes) {
      const seconds = forgeDurationSeconds(r.durationS!, { quickForgeLevel: ctx.profile.quickForgeLevel, coleMoltenForge: ctx.profile.coleMoltenForge });
      const subCrafted = new Set<string>();
      for (const depth of [1, 0]) for (const [bm, sm] of MODES) {
        const parts: Acq[] = [];
        let ok = true;
        for (const inp of r.inputs) {
          const a = acquire(ctx, inp.id, bm, depth, new Set([outId]));
          if (!a) { ok = false; break; }
          parts.push(scale(a, inp.qty / r.outputCount));
        }
        if (!ok) { why ??= missingInput(ctx, r.inputs, bm, outId); continue; }
        if (depth === 0 && !subCrafted.has(`${bm}`)) continue;
        if (depth === 1 && parts.some(x => x.how === "craft")) subCrafted.add(`${bm}`);
        if (onBazaar ? !canSell(ctx, m, sm) : sm === "instant") continue; // AH output: one route per buy mode
        const sell: SellLeg = onBazaar ? sellLeg(ctx, m, sm)
          : { item: outId, name: nameOf(ctx, outId), mode: "ah_reference", grossPrice: m.ahLowestBin!, netPrice: m.ahLowestBin!, flowH: (m.ahSales24h ?? 0) / 24, share: null, undercutsH: null };
        routes.push({
          kind: "forge", key: `forge:${outId}`, title: nameOf(ctx, outId), outputId: outId,
          buys: mergeLegs(parts.flatMap(x => x.legs)),
          steps: [...parts.flatMap(x => x.steps), { type: "forge", label: `Forge ${nameOf(ctx, outId)} (${(seconds / 3600).toFixed(2)} h after reductions)`, opsPerUnit: 1 / r.outputCount, forgeSeconds: seconds, outputPerOp: r.outputCount, requirements: r.requirements }],
          sell, requirements: [{ type: "forge", text: "Forge access (HotM 2)" }, ...parts.flatMap(x => x.reqs), ...r.requirements],
          flags: [...(onBazaar ? m.flags : ["sold on the auction house: lowest BIN shown, AH fees not included"]),
            ...parts.flatMap(x => x.legs.flatMap(l => ctx.market.get(l.item)?.flags.map(f => `${l.name}: ${f}`) ?? []))].filter(f => !f.endsWith("low_history")),
          notes: [`base time ${(r.durationS! / 3600).toFixed(2)} h`],
        });
      }
    }
    if (!routes.length) { skip(ctx, "forge", `forge:${outId}`, nameOf(ctx, outId), why ?? "no recipe could be priced"); continue; }
    out.push(...bestOf(ctx, routes));
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}
