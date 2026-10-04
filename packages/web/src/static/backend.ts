// The static website's "server": answers the same /api/v1/... paths as packages/api, inside a Web Worker in the
// visitor's browser. Live bazaar prices come straight from Hypixel (its API allows requests from any website); history,
// competition, fill statistics, auction prices, recipes and mayors come from the data files published with the site,
// built from community contributions (scripts/data/build-site.mjs). The calculations are the shared ones the server runs.
import {
  type BazaarResponse, BAZAAR, BAZAAR_SOURCES, CALC_KINDS, type CalcKind, ENCHANT_SOURCE, FORGE, FORGE_SOURCES, type EventImpact, type GameEvent, HYPIXEL,
  type HoldStats, type HourProfile, type ItemMarket, type ItemStats, type MayorTerm, NOTICE, type Opportunity, type RankedOpportunity, type Profile, type Recipe, type Settings, type TopEpisode,
  type FillCalibration, type PaperState, type PerkEffects, calibrate, ProfileSchema, SettingsSchema, alertCheckResponse, assembleMarket, booksResponse, ordersCheckResponse, paperResponse, perksResponse, buildOpportunities, dipsResponse, paperCandidates, paperStep, currentTerm, describePerks, perkEffects, calcResponse, calendarEvents, enchantRules, fillReport, forgeSlots, mayorEvents, orderSlots, outlookResponse, parseBookId,
  planResponse, prettyName, quickForgeReduction, quotesFromBazaar, realtimeEvents, requirementsCatalog, siteFileId, taxRate, timingTable,
} from "@bc/shared";

const DATA = `${import.meta.env.BASE_URL}data/`;
/** history older than this is not used for the calculations (shown, with a warning, as "too old") */
const MAX_STATS_AGE = 7 * 86400_000;

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

interface RecipeRow { output_id: string; kind: string; inputs: { id: string; qty: number }[]; output_count: number; duration_s: number | null; requirements: Recipe["requirements"]; requirement_text: string | null }
interface ItemRow { id: string; name: string; category: string | null; tier: string | null; on_bazaar: boolean; npc_sell_price: number | null; unstackable?: boolean }
interface AhLatest { ts: number; lowestBin: number | null; secondBin: number | null; bins: number; auctions: number; sales24h: number; medianSale24h: number | null }
export interface Manifest {
  format: string; builtAt: number; asOf: number; recipesVersion: string | null;
  contributors: { name: string; files: number; hours: number; polls: number; last: number; archiveFiles?: number; archiveSnapshots?: number }[];
  files: { label: string; name: string; kind: string; source: string; from: number; to: number; hours: number; picked: number; polls: number; warnings: string[] }[];
  rejected: { label: string; error: string }[]; daily: { day: string; polls: number }[];
  counts: Record<string, number>;
  /** files in total (`files` lists the newest 500); records of the scanner's paper trading */
  fileCount?: number; paper?: { name: string; updatedAt: number }[];
}
interface Base {
  manifest: Manifest; asOf: number;
  stats: Map<string, ItemStats>; hold: Map<string, { bid?: HoldStats; ask?: HoldStats }>; ah: Map<string, AhLatest>; names: Map<string, string | null>;
  recipeRows: RecipeRow[]; recipes: Map<string, Recipe[]>; items: ItemRow[];
  terms: (MayorTerm & { votes: number | null; candidates: unknown })[]; election: { year: number; candidates: { key?: string; name: string; votes?: number; perks: { name: string; minister?: boolean }[] }[] } | null;
  calibration: FillCalibration;
  hourProfile: HourProfile | null;
}

const getJson = async <T>(url: string, what: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, `${what}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
};

let basePromise: Promise<Base> | null = null;
function base(): Promise<Base> {
  return (basePromise ??= (async () => {
    const [manifest, market, recipeRows, items, mayors] = await Promise.all([
      getJson<Manifest>(`${DATA}manifest.json`, "data manifest"),
      getJson<{ asOf: number; stats: Record<string, ItemStats>; hold: Record<string, { bid?: HoldStats; ask?: HoldStats }>; ah: Record<string, AhLatest>; names: Record<string, string | null>; hourProfile?: HourProfile | null }>(`${DATA}market.json`, "market statistics"),
      getJson<RecipeRow[]>(`${DATA}recipes.json`, "recipes"),
      getJson<ItemRow[]>(`${DATA}items.json`, "items"),
      getJson<{ terms: Base["terms"]; election: Base["election"] }>(`${DATA}mayors.json`, "mayors"),
    ]);
    const recipes = new Map<string, Recipe[]>();
    for (const r of recipeRows) {
      const rec: Recipe = { outputId: r.output_id, kind: r.kind as Recipe["kind"], inputs: r.inputs, outputCount: Number(r.output_count), durationS: r.duration_s ?? undefined,
        requirements: r.requirements, ...(r.kind === "npc" ? { source: r.requirement_text ?? undefined } : {}) } as Recipe;
      recipes.set(rec.outputId, [...(recipes.get(rec.outputId) ?? []), rec]);
    }
    // fill speeds follow what the project scanner's paper trades measured (fill/calibration.ts); none published: the model
    const paperRec = manifest.paper?.length ? await getJson<{ records: { state: { trades: PaperState["trades"] } }[] }>(`${DATA}paper.json`, "paper record").catch(() => null) : null;
    const calibration = calibrate(paperRec?.records.flatMap(r => r.state.trades) ?? []);
    return {
      manifest, asOf: market.asOf, stats: new Map(Object.entries(market.stats)), hold: new Map(Object.entries(market.hold)), ah: new Map(Object.entries(market.ah)),
      names: new Map(Object.entries(market.names)), recipeRows, recipes, items, terms: mayors.terms, election: mayors.election, calibration, hourProfile: market.hourProfile ?? null,
    };
  })().catch(e => { basePromise = null; throw e; }));
}

// ---- live prices
// Hypixel publishes a new bazaar snapshot every 20 s (lastUpdated advances by exactly 20 s; confirmed in our polls).
//   "live"    fetch about 1.5 s after the next snapshot is due; if it is not out yet, retry every 2 s
//   "minute"  fetch once a minute (background tab with alerts or tracked orders)
//   "paused"  fetch only when a page asks and the last prices are over a minute old
// Requests are conditional ("no-cache"): an unchanged snapshot costs a 304 without a body.
export type LiveMode = "live" | "minute" | "paused";
export type WorkerEvent =
  | { type: "snapshot"; dataAt: number; nextAt: number | null; mode: LiveMode }
  | { type: "history"; builtAt: number; asOf: number }
  | { type: "live-error"; message: string }
  | { type: "paper"; state: PaperState };
let mode: LiveMode = "live";
let emit: (ev: WorkerEvent) => void = () => {};
export const setEmitter = (fn: (ev: WorkerEvent) => void) => { emit = fn; };
let live: { at: number; data: BazaarResponse } | null = null;
let liveInFlight: Promise<BazaarResponse> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let started = false, retries = 0, lastHistoryCheck = Date.now();
const SNAPSHOT_EVERY = 20_000;

async function fetchBazaar(): Promise<BazaarResponse> {
  return (liveInFlight ??= (async () => {
    try {
      const r = await fetch(`${HYPIXEL}/skyblock/bazaar`, { cache: "no-cache" });
      if (!r.ok) throw new HttpError(502, `Hypixel bazaar: HTTP ${r.status}`);
      const d = (await r.json()) as BazaarResponse;
      if (!d.success || !d.products) throw new HttpError(502, "Hypixel returned no bazaar data");
      const fresh = !live || d.lastUpdated > live.data.lastUpdated;
      if (fresh) { live = { at: Date.now(), data: d }; emit({ type: "snapshot", dataAt: d.lastUpdated, nextAt: nextDue(), mode }); if (paper) void runPaper(); }
      return live!.data;
    } catch (e) {
      if (live) return live.data; // keep calculating on the last good prices (their age is shown)
      throw e instanceof HttpError ? e : new HttpError(502, `could not reach Hypixel: ${(e as Error).message}`);
    } finally { liveInFlight = null; }
  })());
}
/** local time the next snapshot should be out: 20 s after we first saw the current one */
const nextDue = () => (live ? live.at + SNAPSHOT_EVERY : null);

async function liveBazaar(): Promise<BazaarResponse> {
  start();
  if (live && (mode !== "paused" || Date.now() - live.at < 60_000)) return live.data;
  return fetchBazaar();
}

function start() { if (!started) { started = true; schedule(0); } }
function schedule(ms: number) { if (timer) clearTimeout(timer); timer = setTimeout(() => void tick(), Math.max(0, ms)); }
async function tick() {
  if (mode === "paused") return;
  const before = live?.data.lastUpdated;
  try { await fetchBazaar(); } catch (e) { emit({ type: "live-error", message: (e as Error).message }); }
  if (Date.now() - lastHistoryCheck > 10 * 60_000) void checkHistory();
  if (mode === "minute") return schedule(60_000);
  const isNew = live && live.data.lastUpdated !== before;
  if (isNew) { retries = 0; return schedule(nextDue()! + 1500 - Date.now()); }
  retries++;
  schedule(retries <= 5 ? 2000 : 10_000); // not out yet: look again shortly
}
export function setLiveMode(m: LiveMode) {
  const was = mode;
  mode = m;
  if (m !== "paused" && (was === "paused" || m !== was)) { started = true; schedule(0); }
}

// ---- paper trading in this browser (fill/paper.ts): the page sends your settings and the saved record; every new
// snapshot advances the virtual trades and every 5 minutes the current best bazaar flip is opened
interface PaperConfig { settings: unknown; profile: unknown; state: PaperState }
let paper: PaperConfig | null = null;
let paperBusy = false;
export function setPaper(cfg: PaperConfig | null) { paper = cfg; if (cfg) start(); }
async function runPaper() {
  if (!paper || paperBusy) return;
  paperBusy = true;
  try {
    const [b, m] = await Promise.all([base(), market()]);
    const settings = SettingsSchema.parse(paper.settings ?? {}), profile = ProfileSchema.parse(paper.profile ?? {});
    const candidates = () => paperCandidates(builder(m, b.recipes)("bazaar", settings, profile, false, false).list);
    paper.state = paperStep(paper.state, m.dataAt, m.market, candidates, { checkMin: settings.checkIntervalMin, flipperLevel: settings.bazaarFlipperLevel, quadTaxes: m.perks.quadTaxes });
    emit({ type: "paper", state: paper.state });
  } catch (e) { emit({ type: "live-error", message: `paper trading: ${(e as Error).message}` }); }
  finally { paperBusy = false; }
}

/** A rebuilt site has newer history: reload it (open tabs used to keep the history they started with). */
async function checkHistory() {
  lastHistoryCheck = Date.now();
  try {
    const m = await (await fetch(`${DATA}manifest.json`, { cache: "no-cache" })).json() as Manifest;
    const b = basePromise ? await basePromise : null;
    if (b && m.builtAt !== b.manifest.builtAt) {
      basePromise = null; cur = null; cache.clear(); itemFiles.clear();
      emit({ type: "history", builtAt: m.builtAt, asOf: m.asOf });
    }
  } catch { /* offline: try again next time */ }
}

// ---- the market the calculators use (rebuilt when Hypixel publishes new prices)
interface Market { key: number; market: Map<string, ItemMarket>; events: GameEvent[]; perks: PerkEffects; marketAt: number; dataAt: number; statsAt: number; statsUsed: boolean; calibration: FillCalibration; hourProfile: HourProfile | null }
let cur: Market | null = null;
async function market(): Promise<Market> {
  const [b, d] = await Promise.all([base(), liveBazaar()]);
  if (cur && cur.key === d.lastUpdated) return cur;
  const now = Date.now();
  // statistics describe the time of the newest contributed poll; too old ones are left out (the calculator then treats
  // the history as missing and says so); "an hour ago" only makes sense when the statistics are about now
  const age = d.lastUpdated - b.asOf, use = age <= MAX_STATS_AGE;
  const stats = !use ? new Map<string, ItemStats>() : age > 3 * 3600_000
    ? new Map([...b.stats].map(([k, s]) => [k, { ...s, hourAgo: null }])) : b.stats;
  const ah = new Map([...b.ah].filter(([, a]) => use && a.ts > b.asOf - 2 * 3600_000)
    .map(([k, a]) => [k, { lowestBin: a.lowestBin, sales24h: a.sales24h, medianSale24h: a.medianSale24h }]));
  const m = assembleMarket({ quotes: quotesFromBazaar(d), stats, hold: use ? b.hold : new Map(), ah, names: b.names, now,
    npcSell: new Map(b.items.filter(i => i.npc_sell_price != null).map(i => [i.id, Number(i.npc_sell_price)])),
    unstackable: new Set(b.items.filter(i => i.unstackable).map(i => i.id)) });
  const events = [...calendarEvents(now - 400 * 86400_000, now + 14 * 86400_000), ...realtimeEvents(now - 400 * 86400_000, now + 14 * 86400_000), ...mayorEvents(b.terms)]
    .filter(e => e.end > now - 400 * 86400_000 && e.start < now + 14 * 86400_000).sort((x, y) => x.start - y.start);
  const perks = perkEffects(currentTerm(b.terms, now));
  cache.clear();
  return (cur = { key: d.lastUpdated, market: m, events, perks, marketAt: now, dataAt: d.lastUpdated, statsAt: b.asOf, statsUsed: use, calibration: b.calibration, hourProfile: use ? b.hourProfile : null });
}

const cache = new Map<string, { list: RankedOpportunity[]; skipped: NonNullable<ReturnType<typeof buildOpportunities>["skipped"]> }>();
const builder = (m: Market, recipes: Map<string, Recipe[]>) => (kind: CalcKind, settings: Settings, profile: Profile, includeAhForge: boolean, listAll: boolean) => {
  const k = JSON.stringify([kind, settings, profile, includeAhForge, listAll]);
  let hit = cache.get(k);
  if (!hit) {
    hit = buildOpportunities({ market: m.market, recipes, perks: m.perks, statsAgeH: m.statsUsed ? Math.max(0, (m.dataAt - m.statsAt) / 3.6e6) : 0, calibration: m.calibration, hourProfile: m.hourProfile }, kind, settings, profile, includeAhForge, listAll);
    cache.set(k, hit);
    if (cache.size > 40) cache.delete(cache.keys().next().value!);
  }
  return hit;
};

const itemFiles = new Map<string, Promise<{ history: Record<string, (number | null)[]> & { t: number[] }; episodes: { bid: number[][]; ask: number[][] } } | null>>();
const itemFile = (id: string) => {
  let p = itemFiles.get(id);
  if (!p) { p = fetch(`${DATA}item/${siteFileId(id)}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null); itemFiles.set(id, p); if (itemFiles.size > 60) itemFiles.delete(itemFiles.keys().next().value!); }
  return p;
};

const num = (v: string | null, d: number) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

/** One API request. Returns the JSON body the server would return. */
export async function handle(path: string, body: unknown): Promise<unknown> {
  const url = new URL(path, "http://static");
  const p = url.pathname, qs = url.searchParams, query = Object.fromEntries(qs);
  const b = await base();

  const calc = /^\/api\/v1\/calc\/(\w+)$/.exec(p);
  if (calc) {
    const m = await market();
    const meta = { marketAt: m.marketAt, dataAt: m.dataAt, statsAt: m.statsAt, statsUsed: m.statsUsed, perks: describePerks(m.perks) };
    if (calc[1] === "plan") return planResponse(builder(m, b.recipes), body, meta);
    if (!(CALC_KINDS as readonly string[]).includes(calc[1]!)) throw new HttpError(404, "unknown calculator");
    return calcResponse(builder(m, b.recipes), calc[1] as CalcKind, body, meta);
  }

  let r: RegExpExecArray | null;
  if ((r = /^\/api\/v1\/bazaar\/([^/]+)\/fill$/.exec(p))) {
    const id = decodeURIComponent(r[1]!), m = await market();
    const f = await itemFile(id);
    const eps = (side: "bid" | "ask"): TopEpisode[] => (f?.episodes?.[side] ?? []).map(([start, dur, flow, end, polls]) => ({
      side, price: 0, startTs: start!, endTs: start! + dur! * 1000, durS: dur!, loS: dur!, hiS: dur!, polls: polls!, flow: flow!, removedAtPrice: 0, startAmount: 0, startOrders: 0,
      end: (["outbid", "gone", "cut"] as const)[end!] ?? "cut" }));
    const rep = await fillReport(m.statsUsed ? m.market.get(id) : undefined, query, side => eps(side), m.marketAt);
    if (!rep) throw new HttpError(404, m.statsUsed ? "not on the bazaar or no prices right now" : "the published history is too old for fill statistics");
    return rep;
  }
  if ((r = /^\/api\/v1\/bazaar\/([^/]+)\/history$/.exec(p))) {
    const id = decodeURIComponent(r[1]!);
    const to = num(qs.get("to"), Date.now()), from = num(qs.get("from"), to - 14 * 86400_000);
    const step = Math.max(60, Math.ceil((to - from) / 1000 / 5000), num(qs.get("step"), Math.max(60, Math.round((to - from) / 1000 / 600))));
    const f = await itemFile(id), h = f?.history;
    const pts: { t: number; i: number | null }[] = [];
    if (h) for (let i = 0; i < h.t.length; i++) if (h.t[i]! >= from && h.t[i]! <= to) pts.push({ t: h.t[i]!, i });
    // the newest point is the live price
    const m = cur?.market.get(id);
    if (m && m.ts >= from && m.ts <= to && (!pts.length || m.ts > pts[pts.length - 1]!.t)) pts.push({ t: m.ts, i: null });
    // one point per step (the newest in it), at the start of the step, like the server
    const bins = new Map<number, { t: number; i: number | null }>();
    for (const x of pts) bins.set(Math.floor(x.t / 1000 / step) * step * 1000, x);
    const cols = ["ask_top", "bid_top", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "origin"] as const;
    const val = (x: { i: number | null }, c: (typeof cols)[number]): number | null => {
      if (x.i == null) {
        if (!m) return null;
        return ({ ask_top: m.ask, bid_top: m.bid, ask_volume: m.askVolume, bid_volume: m.bidVolume, ask_orders: m.askOrders, bid_orders: m.bidOrders, ibuy_week: m.ibuyWeek, isell_week: m.isellWeek, origin: 1 } as Record<string, number | null>)[c] ?? null;
      }
      const col = h?.[c];
      return col ? (col[x.i] ?? null) : null;
    };
    const rows: ({ t: number; x: { i: number | null } } | { t: number; x: null })[] = [];
    let prevT: number | null = null;
    for (const [t, x] of [...bins].sort((a, c) => a[0] - c[0])) {
      // where nothing was recorded insert an empty point so charts show a gap instead of a straight line
      if (prevT != null && t - prevT > Math.max(3 * step * 1000, 10 * 60_000)) rows.push({ t: prevT + step * 1000, x: null });
      rows.push({ t, x }); prevT = t;
    }
    const series: Record<string, (number | null)[]> = { t: rows.map(x => x.t) };
    for (const c of cols) series[c] = rows.map(x => (x.x ? val(x.x, c) : null));
    return { id, from, to, stepSeconds: step, series };
  }
  if ((r = /^\/api\/v1\/auctions\/([^/]+)$/.exec(p))) {
    const key = decodeURIComponent(r[1]!), days = Math.min(90, num(qs.get("days"), 7));
    const f = await fetch(`${DATA}ah/${siteFileId(key)}.json`).then(x => (x.ok ? x.json() : null)).catch(() => null) as
      { latest: unknown; lowestBinHourly: { t: number; lowest: number | null }[]; sales: { t: number; price: number; bin: boolean }[] } | null;
    const since = b.asOf - days * 86400_000;
    return { key, latest: f?.latest ?? null, lowestBinHourly: (f?.lowestBinHourly ?? []).filter(x => x.t > since), sales: (f?.sales ?? []).filter(x => x.t > since).slice(0, 500) };
  }
  if (p === "/api/v1/items") {
    const q = (qs.get("q") ?? "").trim().toUpperCase(), bz = qs.get("bazaar"), limit = Math.min(500, num(qs.get("limit"), 50));
    const live = (await market().catch(() => null))?.market;
    // every product in the live snapshot is searchable even if the published item list lacks it
    const known = new Set(b.items.map(i => i.id));
    const extra: ItemRow[] = live ? [...live.values()].filter(m => !known.has(m.id)).map(m => ({ id: m.id, name: m.name, category: null, tier: null, on_bazaar: true, npc_sell_price: null })) : [];
    return [...b.items, ...extra].filter(i => (!q || i.id.includes(q.replace(/ /g, "_")) || (i.name ?? "").toUpperCase().includes(q)) && (bz == null || (i.on_bazaar || !!live?.get(i.id)?.ts) === (bz === "1")))
      .sort((x, y) => Number(y.on_bazaar) - Number(x.on_bazaar) || x.id.length - y.id.length || x.id.localeCompare(y.id)).slice(0, limit);
  }
  if ((r = /^\/api\/v1\/items\/([^/]+)$/.exec(p))) {
    const id = decodeURIComponent(r[1]!), m = await market();
    const item = b.items.find(i => i.id === id) ?? null, mk = m.market.get(id);
    if (!item && !mk) throw new HttpError(404, "unknown item");
    const book = parseBookId(id);
    const used = new Map<string, { output_id: string; kind: string; name: string }>();
    for (const rr of b.recipeRows) if (rr.inputs.some(i => i.id === id) && used.size < 60) used.set(`${rr.output_id}|${rr.kind}`, { output_id: rr.output_id, kind: rr.kind, name: prettyName(rr.output_id, m.market.get(rr.output_id)?.name) });
    return {
      id, name: prettyName(id, item?.name), item, market: mk ?? null,
      book: mk && (mk.topBid?.length || mk.topAsk?.length) ? { ts: mk.ts, bids: mk.topBid ?? [], asks: mk.topAsk ?? [] } : null,
      recipes: b.recipeRows.filter(x => x.output_id === id), usedIn: [...used.values()], stats: b.stats.get(id) ?? null,
      enchant: book ? { ...enchantRules()[book.enchant], level: book.level } : null,
    };
  }
  if (p === "/api/v1/events") {
    const m = await market();
    const to = Math.min(num(qs.get("to"), Date.now() + 7 * 86400_000), Date.now() + 366 * 86400_000);
    const from = Math.max(num(qs.get("from"), Date.now() - 2 * 86400_000), to - 366 * 86400_000);
    return m.events.filter(e => e.end > from && e.start < to);
  }
  if (p === "/api/v1/mayors") return { terms: b.terms.slice(0, num(qs.get("limit"), 200)), election: b.election };
  if (p === "/api/v1/outlook") {
    const m = await market();
    const impacts = new Map<string, EventImpact[]>([...b.stats].filter(([, s]) => Array.isArray(s.eventImpact)).map(([k, s]) => [k, s.eventImpact!]));
    return outlookResponse(m.events, b.election, impacts, m.market, query);
  }
  if (p === "/api/v1/market") {
    const m = await market();
    const ids = (qs.get("ids") ?? "").split(",").filter(Boolean).slice(0, 5000);
    const pick = (x: ItemMarket) => ({ ts: x.ts, bid: x.bid, ask: x.ask, ibuyWeek: x.ibuyWeek, isellWeek: x.isellWeek, observedBuyFlowH: x.observedBuyFlowH ?? null,
      observedSellFlowH: x.observedSellFlowH ?? null, liveHours: x.liveHours, flowBasis: x.flowBasis ?? null, npcSellPrice: x.npcSellPrice ?? null, flags: x.flags, flagWhy: x.flagWhy, ref: x.ref ?? null });
    const items = ids.length ? Object.fromEntries(ids.map(i => [i, m.market.get(i)]).filter(([, x]) => x).map(([i, x]) => [i, pick(x as ItemMarket)]))
      : Object.fromEntries([...m.market].map(([i, x]) => [i, pick(x)]));
    return { marketAt: m.marketAt, dataAt: m.dataAt, statsAt: m.statsAt, items };
  }
  if (p === "/api/v1/dips") { const m = await market(); return dipsResponse(m.market, query, m.perks); }
  if (p === "/api/v1/books") { const m = await market(); return booksResponse(m.market, (qs.get("ids") ?? "").split(",").filter(Boolean)); }
  if (p === "/api/v1/orders/check") { const m = await market(); return ordersCheckResponse(m.market, body); }
  if (p === "/api/v1/perks") { const m = await market(); return perksResponse(m.perks); }
  if (p === "/api/v1/alerts/check") {
    const m = await market();
    return alertCheckResponse(builder(m, b.recipes), body, { marketAt: m.marketAt, dataAt: m.dataAt, statsAt: m.statsAt, statsUsed: m.statsUsed, perks: describePerks(m.perks) });
  }
  if (p === "/api/v1/paper") {
    // the project's always-on scanner trades on paper around the clock and publishes its record with the data
    const rec = b.manifest.paper?.length ? await getJson<{ records: { name: string; updatedAt: number; state: Omit<PaperState, "counters"> }[] }>(`${DATA}paper.json`, "paper record").catch(() => null) : null;
    const r = rec?.records[0];
    if (!r) throw new HttpError(404, "no paper-trading record is published yet");
    return paperResponse({ ...r.state, counters: {} }, { source: "scanner", name: r.name, updatedAt: r.updatedAt, since: r.state.trades[0]?.openedAt ?? null });
  }
  if (p === "/api/v1/status" || p === "/api/v1/health") {
    const m = await market().catch(() => null);
    return { static: true, notice: NOTICE, manifest: b.manifest, marketLoadedAt: m?.marketAt ?? null, dataAt: m?.dataAt ?? null, statsAt: b.asOf, statsUsed: m?.statsUsed ?? null };
  }
  if (p === "/api/v1/rules/bazaar") return { ...BAZAAR, orderSlotsByFlipperLevel: [0, 1, 2].map(orderSlots), taxByFlipperLevel: [0, 1, 2].map(l => taxRate(l, cur?.perks.quadTaxes)), activePerks: cur ? describePerks(cur.perks) : [], sources: BAZAAR_SOURCES };
  if (p === "/api/v1/rules/forge") return { ...FORGE, slotsByHotm: Array.from({ length: 11 }, (_, i) => forgeSlots(i)), quickForgeByLevel: Array.from({ length: 21 }, (_, i) => quickForgeReduction(i)), sources: FORGE_SOURCES };
  if (p === "/api/v1/rules/requirements") return requirementsCatalog([...b.recipes.values()].flat());
  if (p === "/api/v1/rules/enchants") return { source: ENCHANT_SOURCE, rules: enchantRules() };
  if (p === "/api/v1/rules/timing") {
    const t = { pingMs: num(qs.get("ping"), 80), clickDelayMs: num(qs.get("click"), 350), typingMs: num(qs.get("typing"), 1500) };
    return { model: "step = ping + 50 ms server tick + click delay (typing for commands and signs)", settings: t, actions: timingTable(t), measuredByContributors: [] };
  }
  throw new HttpError(404, "not available on the static website (needs the self-hosted server)");
}
