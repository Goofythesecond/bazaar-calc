// What the API endpoints compute, independent of where the data comes from: the server answers HTTP requests with it,
// the static website runs it in the visitor's browser. Inputs are validated and clamped the same way in both.
import { z } from "zod";
import { BAZAAR, describePerks, limitContribution, type PerkEffects, DEFAULT_PROFILE, type Profile, type GameEvent, SB_YEAR, mayorEvents, termStart } from "../rules/index.js";
import { type Ctx, type RankedOpportunity, bazaarFlips, bookFlips, craftFlips, forgeFlips, npcFlips, routeConfidence, DEFAULT_SETTINGS, type Opportunity, type Settings, plan } from "../calc/index.js";
import type { Recipe } from "../recipes/index.js";
import { type BookSnapshot, type OrderEvent, type PaperCandidate, type PaperState, type TrackedOrder, curve, fillModel, paperSummary, sizeFor, type TopEpisode, quotaTime, survival, trackOrder, updateOrder } from "../fill/index.js";
import { type HoldStats, type ItemMarket, buyFlowH, sellFlowH, type EventImpact, findDips, outlook, prettyName } from "../market/index.js";

/** Drop keys whose value is undefined, so they fall back to the defaults instead of overwriting them. */
const defined = <T extends object>(v: T): Partial<T> => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as Partial<T>;

/** Numbers are clamped into range (a pasted backup or an old saved setting must not break every calculation);
 *  anything that is not a number falls back to the default. */
const num = (min: number, max: number) =>
  z.preprocess(v => { if (v === "" || v == null) return undefined; const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined; }, z.number().optional());

export const SettingsSchema = z.object({
  coins: num(0, 1e13), bazaarFlipperLevel: num(0, 2), checkIntervalMin: num(0.5, 240), hoursPerDay: num(0.1, 24),
  dailyLimit: num(0, 1e12), attention: num(0.05, 1), craftsPerHourMax: num(0, 1e6), unknownCompetitionShare: num(0.01, 1),
  minUnitsPerHour: num(0, 1e9), includeFlagged: z.coerce.boolean(), pingMs: num(0, 5000), clickDelayMs: num(0, 10000), typingMs: num(0, 30000),
}).partial().transform(v => ({ ...DEFAULT_SETTINGS, ...defined(v) }) as Settings);

export const ProfileSchema = z.object({
  hotmTier: num(0, 10), quickForgeLevel: num(0, 20), enchantingLevel: num(0, 60), xpLevels: num(0, 10000),
  collections: z.record(z.string(), num(0, 100)), slayers: z.record(z.string(), num(0, 10)), reputation: z.record(z.string(), num(0, 1e6)),
  coleMoltenForge: z.coerce.boolean(), quadTaxes: z.coerce.boolean(), npcShoppingSpree: z.coerce.boolean(), ignoreRequirements: z.coerce.boolean(),
}).partial().transform(v => ({ ...DEFAULT_PROFILE, ...defined(v) }) as Profile);

export const FilterSchema = z.object({
  q: z.string().max(100).optional(),
  minCoinsH: num(0, 1e12).optional(),
  minProfit: num(-1e12, 1e12).optional(),
  minMargin: num(-10, 100).optional(),
  maxCapital: num(0, 1e13).optional(),
  maxOrders: num(0, 28).optional(),
  requirementsMet: z.coerce.boolean().optional(),
  noFlags: z.coerce.boolean().optional(),
  buyModes: z.array(z.enum(["instant", "order"])).optional(),
  sellModes: z.array(z.enum(["instant", "offer", "ah_reference", "npc"])).optional(),
  sort: z.enum(["coinsH", "scoreH", "profitPerUnit", "marginPct", "unitsH", "capitalUsed"]).default("coinsH"),
  limit: num(1, 500).default(100),
  offset: num(0, 1e6).default(0),
  includeAhForge: z.coerce.boolean().optional(),
  profitableOnly: z.coerce.boolean().optional(),
  /** only routes whose output is one of these items (your favourites) */
  items: z.array(z.string().max(80)).max(500).optional(),
}).partial();
export type Filters = z.infer<typeof FilterSchema>;

export const CalcBody = z.object({ settings: SettingsSchema.optional(), profile: ProfileSchema.optional(), filters: FilterSchema.optional() });
export const PlanBody = CalcBody.extend({ options: z.object({ kinds: z.array(z.enum(["bazaar", "craft", "book", "forge", "npc"])).optional(), requireMet: z.boolean().optional(), maxPicks: z.number().int().min(1).max(50).optional() }).optional() });
export const CALC_KINDS = ["bazaar", "craft", "book", "forge", "npc", "all"] as const;
export type CalcKind = (typeof CALC_KINDS)[number];

const warned = (o: Opportunity) => o.flags.some(x => !x.endsWith("low_history"));

/** Filters, then sorts; routes with market warnings (often manipulated prices) come after clean ones. */
export function applyFilters<T extends RankedOpportunity>(list: T[], f: Filters): T[] {
  const q = f.q?.toLowerCase();
  return list.filter(o =>
    (!q || o.title.toLowerCase().includes(q) || o.outputId.toLowerCase().includes(q)) &&
    (!f.minCoinsH || o.coinsH >= f.minCoinsH) &&
    (f.minProfit == null || o.profitPerUnit >= f.minProfit) &&
    (f.minMargin == null || o.marginPct >= f.minMargin) &&
    (f.maxCapital == null || o.capitalUsed <= f.maxCapital) &&
    (f.maxOrders == null || o.ordersUsed <= f.maxOrders) &&
    (!f.requirementsMet || o.unmet.length === 0) &&
    (!f.noFlags || !warned(o)) &&
    (!f.buyModes || o.buys.every(b => b.mode === "npc" || f.buyModes!.includes(b.mode))) &&
    (!f.sellModes || f.sellModes.includes(o.sell.mode)) &&
    (!f.profitableOnly || o.coinsH > 0) &&
    (!f.items || f.items.includes(o.outputId)),
  ).sort((a, b) => Number(warned(a)) - Number(warned(b)) || (b[f.sort ?? "coinsH"] as number) - (a[f.sort ?? "coinsH"] as number));
}

/** What the website and API clients need: the measurement samples behind each order leg (~2 KB per leg) and the
 *  per-order size table stay out (the fill report serves the evidence). */
export function compact(o: Opportunity) {
  const { fill: _bf, ...sell } = o.sell;
  return { ...o, sell, buys: o.buys.map(({ fill: _f, ...b }) => b), orderPlan: o.orderPlan.map(({ options: _o, ...l }) => l) };
}

/** `perks`: mayor / minister perks active now (they change tax, forge times and NPC limits; see rules/mayor-perks.ts). */
export interface MarketSource { market: Map<string, ItemMarket>; recipes: Map<string, Recipe[]>; perks: PerkEffects;
  /** age of the history behind the statistics (static site; 0 on a server that scans itself) */
  statsAgeH?: number }

/** Every route of a kind (`listAll`: incl. losing ones and flagged markets, for the flip tables; off for the planner). */
export function buildOpportunities(src: MarketSource, kind: CalcKind, settings: Settings, profile: Profile, includeAhForge = false, listAll = false) {
  const c: Ctx = { market: src.market, recipes: src.recipes, settings, listAll, skipped: [], profile: { ...profile,
    coleMoltenForge: profile.coleMoltenForge || src.perks.coleMoltenForge, quadTaxes: profile.quadTaxes || src.perks.quadTaxes,
    npcShoppingSpree: profile.npcShoppingSpree || src.perks.shoppingSpree } };
  const out: Opportunity[] = [];
  if (kind === "all" || kind === "bazaar") out.push(...bazaarFlips(c));
  if (kind === "all" || kind === "craft") out.push(...craftFlips(c, { includeAhOutputs: includeAhForge }));
  if (kind === "all" || kind === "book") out.push(...bookFlips(c));
  if (kind === "all" || kind === "forge") out.push(...forgeFlips(c, { includeAhOutputs: includeAhForge }));
  if (kind === "all" || kind === "npc") out.push(...npcFlips(c));
  const ranked: RankedOpportunity[] = out.map(o => { const confidence = routeConfidence(o, src.market, src.statsAgeH ?? 0); return { ...o, confidence, scoreH: o.coinsH * confidence.score }; });
  return { list: ranked, skipped: c.skipped! };
}

type Build = (kind: CalcKind, settings: Settings, profile: Profile, includeAhForge: boolean, listAll: boolean) => ReturnType<typeof buildOpportunities>;

/** POST /api/v1/calc/{kind}. `build` may cache buildOpportunities. */
export function calcResponse(build: Build, kind: CalcKind, input: unknown, meta: Record<string, unknown> & { marketAt: number; dataAt: number }) {
  const b = CalcBody.parse(input ?? {});
  const settings = SettingsSchema.parse(b.settings ?? {}), profile = ProfileSchema.parse(b.profile ?? {}), f = FilterSchema.parse(b.filters ?? {});
  const { list, skipped } = build(kind, settings, profile, f.includeAhForge ?? false, true);
  const all = applyFilters(list, f);
  return {
    total: all.length, profitable: all.filter(o => o.coinsH > 0).length, offset: f.offset ?? 0,
    rows: all.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 100)).map(compact), skipped, ...meta,
  };
}

/** POST /api/v1/calc/plan */
export function planResponse(build: Build, input: unknown, meta: Record<string, unknown> & { marketAt: number; dataAt: number }) {
  const b = PlanBody.parse(input ?? {});
  const settings = SettingsSchema.parse(b.settings ?? {}), profile = ProfileSchema.parse(b.profile ?? {});
  const candidates = applyFilters(build("all", settings, profile, b.filters?.includeAhForge ?? false, false).list, FilterSchema.parse({ ...(b.filters ?? {}), limit: 500 }));
  const p = plan(candidates, settings, profile, b.options ?? {});
  // a pick is its candidate re-sized to the coins it got: same evidence, so the same confidence
  const conf = new Map(candidates.map(c => [c.key, c.confidence]));
  const picks = p.picks.map(o => { const confidence = conf.get(o.key)!; return { ...compact(o), confidence, scoreH: o.coinsH * confidence.score }; });
  return { ...p, picks, ...meta };
}

export const FILL_METHOD = [
  "Every poll (every 20 s; Hypixel refreshes the bazaar about that often) is compared with the previous one. When a side shows a NEW best price that beats the old best (somebody posted one tick better, as a flipper does), an episode starts.",
  "It ends when a later poll shows a better price (outbid / undercut), or when that level is gone and the best price got worse (filled or cancelled; polls cannot tell which). A gap in polling cuts the episode (counted as censored, never as an end).",
  "Durations are known to within one poll (~20 s): the midpoint is used and the bounds are kept. Survival (share of new best prices still on top after t seconds) is a Kaplan-Meier estimate, so cut episodes are handled correctly.",
  "Units per episode = units that left the book at prices the top order was ahead of while it was on top. The long-run rate is scaled to the item's measured instant-trade flow (min of Hypixel's 7-day figure and what we saw leave the book).",
  "Order sizes: each episode is replayed as one cycle: post Q units on top, hold for the measured time, fill at the measured flow, notice at your next look, relist. Every order created counts its full value toward the daily limit.",
  "Quota time: 2,000 simulated runs drawing real episodes until the quota is filled; p10 / p50 / p90 of the minutes needed.",
];

const toNum = (v: unknown, d: number) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));
export const FILL_DEFAULT_HOURS = 24;

/** GET /api/v1/bazaar/{id}/fill: time on top, order sizes and quota time for one item. `episodes(side, hours)` returns
 *  that side's measured episodes, oldest first. Null when the item has no prices right now. */
export async function fillReport(m: ItemMarket | undefined, query: Record<string, unknown>, episodes: (side: "bid" | "ask", hours: number) => Promise<TopEpisode[]> | TopEpisode[], at: number) {
  if (!m || m.ask == null || m.bid == null) return null;
  const check = Math.min(240, Math.max(0.5, toNum(query.check, 5)));
  const qty = Math.min(10_000_000, Math.max(0, Math.round(toNum(query.qty, 0))));
  const hours = Math.min(72, Math.max(1, toNum(query.hours, FILL_DEFAULT_HOURS)));
  const unknownShare = Math.min(1, Math.max(0.01, toNum(query.unknownShare, 0.5)));
  const side = async (s: "bid" | "ask") => {
    const buy = s === "bid";
    const price = buy ? m.bid! + 0.1 : m.ask! - 0.1;
    const flowH = buy ? buyFlowH(m) : sellFlowH(m);
    const stats: HoldStats | null | undefined = buy ? m.holdBid : m.holdAsk;
    const model = fillModel(stats, flowH, buy ? m.undercutBuyH : m.undercutSellH, check, unknownShare);
    const maxQty = buy ? BAZAAR.maxUnitsPerOrder : Math.max(1, Math.min(BAZAAR.maxUnitsPerOrder, Math.floor(BAZAAR.maxSellOfferValue / price)));
    const c = curve(model, check).filter(p => p.qty <= maxQty);
    const eps = await episodes(s, hours);
    const measured = eps.reduce((a, e) => a + e.flow, 0) / Math.max(1e-9, eps.reduce((a, e) => a + e.durS, 0));
    const k = measured > 0 ? flowH / 3600 / measured : 0;
    const scaled = eps.map(e => ({ ...e, flow: e.flow * k }));
    const km = survival(eps);
    const step = Math.max(1, Math.floor(km.length / 80));
    const q = qty > 0 ? quotaTime(scaled, qty, check) : null;
    const ended = eps.filter(e => e.end !== "cut");
    return {
      side: buy ? "buy" : "sell", price, flowH, basis: model.basis, maxQty,
      stats: stats ? { ...stats, samples: undefined } : null,
      episodes: { n: eps.length, outbid: ended.filter(e => e.end === "outbid").length, gone: ended.filter(e => e.end === "gone").length, cut: eps.length - ended.length,
        calibration: measured > 0 ? flowH / 3600 / measured : null },
      survival: km.filter((_, i) => i % step === 0 || i === km.length - 1),
      curve: c.map(p => ({ ...p, perOrder: p.ordersH > 0 ? p.unitsH / p.ordersH : 0, limitCoinsH: p.ordersH * limitContribution(p.qty * price) })),
      best: (() => { const top = sizeFor(c, Infinity, maxQty); const small = sizeFor(c, top.unitsH * 0.95, maxQty); return { max: top, at95: small }; })(),
      quota: q && { ...q, ordersAtOnce: Math.ceil(qty / maxQty), limitCoins: q.postedUnits * price, basis: "measured" },
    };
  };
  const [buy, sell] = await Promise.all([side("bid"), side("ask")]);
  return { id: m.id, name: m.name, check, windowHours: hours, at, buy, sell, method: FILL_METHOD };
}

interface Candidate { key?: string; name: string; votes?: number; perks: { name: string; minister?: boolean }[] }
/** GET /api/v1/outlook. `election`: Hypixel's current election (null if unknown). */
export function outlookResponse(events: GameEvent[], election: { year: number; candidates: Candidate[] } | null | undefined, impacts: Map<string, EventImpact[]>,
  market: Map<string, ItemMarket>, query: Record<string, unknown>, now = Date.now()) {
  const to = now + toNum(query.days, 7) * 86400_000;
  const upcoming = events.filter(e => e.start >= now - 3600_000 && e.start < to);
  // The next mayor is only known when the election closes; until then use the current vote leader as a forecast.
  const el = election;
  if (el?.candidates?.length) {
    const start = termStart(el.year), lead = [...el.candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
    const total = el.candidates.reduce((a, c) => a + (c.votes ?? 0), 0);
    if (start >= now && start < to && lead && !upcoming.some(e => e.kind === "mayor_term" && e.start === start)) {
      const share = total ? ` (${Math.round(((lead.votes ?? 0) / total) * 100)}% of votes so far)` : "";
      const forecast = mayorEvents([{ electionYear: el.year, name: lead.name, start, end: start + SB_YEAR, perks: lead.perks.filter(p => !p.minister).map(p => p.name), minister: null }]);
      upcoming.push(...forecast.map(e => ({ ...e, confidence: "approximate" as const, detail: `forecast: current vote leader ${lead.name}${share}` })));
    }
  }
  const list = outlook(upcoming, impacts, toNum(query.minChange, 0.02)).map(o => ({ ...o, name: market.get(o.itemId)?.name ?? prettyName(o.itemId) }));
  return { upcoming, outlook: list.slice(0, 1000), note: "Historical correlation only: overlapping events and trends are not removed." };
}

/** GET /api/v1/rules/requirements: everything the recipes can require, so the requirements form only asks about what matters. */
export function requirementsCatalog(recipes: Iterable<Recipe>): { type: string; name: string | null; max: number | null; recipes: number }[] {
  const g = new Map<string, { type: string; name: string | null; max: number | null; outputs: Set<string> }>();
  for (const r of recipes) for (const q of r.requirements ?? []) {
    const name = "name" in q ? q.name : "faction" in q ? q.faction : null;
    const v = "tier" in q ? q.tier : "level" in q ? q.level : "amount" in q ? q.amount : null;
    const k = `${q.type}|${name}`;
    const e = g.get(k) ?? { type: q.type, name, max: null, outputs: new Set<string>() };
    if (v != null && (e.max == null || v > e.max)) e.max = v;
    e.outputs.add(r.outputId);
    g.set(k, e);
  }
  return [...g.values()].map(e => ({ type: e.type, name: e.name, max: e.max, recipes: e.outputs.size }))
    .sort((a, b) => a.type.localeCompare(b.type) || b.recipes - a.recipes);
}

/** GET /api/v1/dips: items whose cheapest sell offer is far below its typical price (market/dips.ts). */
export function dipsResponse(market: Map<string, ItemMarket>, query: Record<string, unknown>, perks: PerkEffects) {
  const minDrop = Math.min(0.9, Math.max(0.02, toNum(query.minDrop, 0.1)));
  const level = Math.min(2, Math.max(0, Math.round(toNum(query.flipperLevel, 0))));
  const rows = findDips(market, { minDrop, flipperLevel: level, quadTaxes: perks.quadTaxes });
  return { minDrop, total: rows.length, rows: rows.slice(0, Math.min(500, Math.max(1, toNum(query.limit, 100)))) };
}

/** GET /api/v1/books?ids=A,B: current order books and Hypixel's 7-day counters (the order tracker follows your orders with them). */
export function booksResponse(market: Map<string, ItemMarket>, ids: string[]) {
  const items: Record<string, BookSnapshot & { name: string }> = {};
  for (const id of ids.slice(0, 50)) {
    const m = market.get(id);
    if (m && (m.topBid || m.topAsk)) items[id] = { name: m.name, ts: m.ts, bids: m.topBid ?? [], asks: m.topAsk ?? [], buyWeek: m.ibuyWeek, sellWeek: m.isellWeek };
  }
  return { items };
}

/** The routes paper trading may open, best first: profitable bazaar flips with order legs and no serious warnings, ranked
 *  by coins/h x confidence; the size is the route's buy order. Shared by the browser and the server. */
export function paperCandidates(list: RankedOpportunity[]): PaperCandidate[] {
  return list
    .filter(o => o.kind === "bazaar" && o.coinsH > 0 && !o.key.endsWith(":instant") && o.flags.every(f => f === "low_history" || f === "mass_delists"))
    .sort((a, b) => b.scoreH - a.scoreH)
    .map(o => ({ key: o.key, title: o.title, item: o.outputId, qty: o.orderPlan.find(l => l.side === "buy")?.qty ?? o.batch, profitPerUnit: o.profitPerUnit, unitsH: o.unitsH, kind: o.kind }));
}

// ---- alerts: one rule set for the website's alerts, the server's Discord alerts (api/src/jobs.ts) and POST /api/v1/alerts/check
export const AlertRulesSchema = z.object({
  minCoinsH: num(0, 1e12).optional(),
  minMarginPct: num(0, 10_000).optional(),
  kinds: z.array(z.enum(["bazaar", "craft", "book", "forge", "npc"])).optional(),
  noWarnings: z.coerce.boolean().optional(),
  minConfidence: z.enum(["low", "medium", "high"]).optional(),
  /** only these items (favourites) */
  items: z.array(z.string().max(80)).max(500).optional(),
});
export type AlertRules = z.infer<typeof AlertRulesSchema>;
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 } as const;

/** Routes that meet alert rules, best first (coins/h x confidence): profitable, order routes only (an instant variant
 *  of the same flip would alert twice). */
export function alertMatches(list: RankedOpportunity[], r: AlertRules): RankedOpportunity[] {
  const rows = applyFilters(list, FilterSchema.parse({ sort: "scoreH", profitableOnly: true, minCoinsH: r.minCoinsH || undefined,
    minMargin: r.minMarginPct ? r.minMarginPct / 100 : undefined, noFlags: r.noWarnings || undefined }));
  return rows.filter(o => (!r.kinds || r.kinds.includes(o.kind as never)) && CONFIDENCE_RANK[o.confidence.level] >= CONFIDENCE_RANK[r.minConfidence ?? "low"]
    && !o.key.endsWith(":instant") && (!r.items?.length || r.items.includes(o.outputId)));
}

const AlertCheckBody = z.object({ settings: z.unknown().optional(), profile: z.unknown().optional(), rules: z.unknown().optional(), limit: num(1, 200) });
/** POST /api/v1/alerts/check {settings, profile, rules}: the routes that meet these alert rules right now, best first
 *  (what an alert would announce). */
export function alertCheckResponse(build: Build, input: unknown, meta: Record<string, unknown>) {
  const b = AlertCheckBody.parse(input ?? {});
  const settings = SettingsSchema.parse(b.settings ?? {}), profile = ProfileSchema.parse(b.profile ?? {}), rules = AlertRulesSchema.parse(b.rules ?? {});
  const rows = alertMatches(build("all", settings, profile, false, true).list, rules);
  return { total: rows.length, rules, rows: rows.slice(0, b.limit ?? 50).map(compact), ...meta };
}

// ---- order tracking without a browser: POST /api/v1/orders/check
const OrderSpec = z.object({ id: z.string().max(80).optional(), item: z.string().min(1).max(80), side: z.enum(["buy", "sell"]), price: z.number().positive().max(1e10), amount: z.number().int().min(1).max(71_680) });
// an order returned by an earlier call (TrackedOrder): sent back as it was, so its queue position carries on
const Tracked = OrderSpec.extend({ id: z.string().max(80), name: z.string().max(200), createdAt: z.number(), updatedAt: z.number(), ahead: z.number(), filled: z.number(),
  confirmed: z.boolean(), seen: z.boolean(), status: z.enum(["top", "behind", "filled"]), best: z.number().nullable(), level: z.number(), better: z.number(),
  buyWeek: z.number().nullable().optional(), sellWeek: z.number().nullable().optional(), decisionId: z.string().max(80).optional() });
const OrdersCheckBody = z.object({ orders: z.array(z.union([Tracked, OrderSpec])).min(1).max(50) });
/** POST /api/v1/orders/check: new orders ({item, side, price, amount}) are placed in the queue; orders from an earlier
 *  answer are advanced to the current book (fill/order-tracker.ts), with the events since (outbid, filled, back on top). */
export function ordersCheckResponse(market: Map<string, ItemMarket>, input: unknown) {
  const body = OrdersCheckBody.parse(input ?? {});
  const books = booksResponse(market, [...new Set(body.orders.map(o => o.item))]).items;
  const orders: TrackedOrder[] = [], events: OrderEvent[] = [], missing: string[] = [];
  body.orders.forEach((o, i) => {
    const b = books[o.item];
    if (!b) { missing.push(o.item); return; }
    if ("updatedAt" in o) { const u = updateOrder(o as TrackedOrder, b); orders.push(u.order); events.push(...u.events); }
    else orders.push(trackOrder({ id: o.id ?? `${b.ts}-${i}-${o.item}`, item: o.item, name: b.name, side: o.side, price: o.price, amount: Math.round(o.amount) }, b));
  });
  return { at: Math.max(0, ...Object.values(books).map(b => b.ts)), orders, events, missing: [...new Set(missing)] };
}

/** GET /api/v1/perks: mayor perks that change the calculator right now. */
export function perksResponse(perks: PerkEffects) {
  return { effects: perks, active: describePerks(perks) };
}

/** GET /api/v1/paper: a paper-trading record with its summary (realized vs expected, win rate, time per trade). */
export function paperResponse(state: PaperState, extra: Record<string, unknown>) {
  return { ...extra, summary: paperSummary(state), state };
}
