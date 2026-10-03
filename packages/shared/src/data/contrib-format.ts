// Contribution data files ("bazaar-calc-data/1"): what a collector records, uploaded to the GitHub repo by pull request
// and merged into the website's data. One file covers one stretch of polling (normally one UTC day or less).
//
// Only what the calculator uses is kept (no raw order books, no player data):
//   polls     Hypixel's lastUpdated of every bazaar snapshot recorded (identical for everybody who saw that snapshot,
//             which makes overlapping contributions exactly comparable and de-duplicable)
//   closes    per item, the last poll of each UTC hour: best prices, book volumes and orders, Hypixel's 7-day counters
//   flow      per item and UTC hour: units that left the top of each side between consecutive polls (fills + cancels),
//             how often the best price was beaten, seconds watched
//   episodes  time-on-top episodes (see toptrack.ts): how long each freshly posted best price stayed best and how many
//             units traded against it
//   ah        lowest BINs per item key (last scan of each hour) and anonymous auction sale prices
//   election  the mayor / election response whenever it changed
//
// On disk the JSON is gzipped and sorted columns are delta-coded (encodeDataFile / decodeDataFile); in memory every
// column holds absolute values.
import type { ElectionResponse } from "./hypixel.js";

export const DATA_FORMAT = "bazaar-calc-data/1";
export type CollectorKind = "node" | "browser" | "export";
export type DataSource = "poll" | "wayback";

export interface DataFile {
  format: typeof DATA_FORMAT;
  /** contributor: GitHub login (the file name starts with it) */
  name: string;
  collector: { kind: CollectorKind; version: string; source: DataSource };
  from: number;
  to: number;
  /** Hypixel lastUpdated (ms) of every bazaar snapshot, ascending */
  polls: number[];
  /** bazaar item ids; other columns refer to them by index */
  items: string[];
  closes: {
    poll: number[]; item: number[];                               // index into polls / items
    ask: (number | null)[]; bid: (number | null)[];               // best sell offer / buy order, centicoins
    askVol: number[]; bidVol: number[]; askOrders: number[]; bidOrders: number[];
    buyWeek: number[]; sellWeek: number[];                        // Hypixel buyMovingWeek / sellMovingWeek
  };
  flow: {
    hour: number[]; item: number[];                               // hour = ms / 3,600,000 (UTC hour number)
    intervals: number[]; seconds: number[]; bidOutbid: number[]; askUndercut: number[]; bidRemoved: number[]; askRemoved: number[];
    // real trades from Hypixel's 7-day counters (counterTrades in hypixel.ts); absent in files made before 2026-10-03
    tradeIntervals?: number[]; tradeSeconds?: number[]; bidTrades?: number[]; askTrades?: number[];
  };
  episodes: {
    item: number[]; side: number[];                               // side 0 = best buy order, 1 = best sell offer
    start: number[];                                              // ms (the poll that first showed the price)
    dur: number[];                                                // tenths of a second on top (midpoint estimate)
    polls: number[]; flow: number[];
    end: number[];                                                // 0 outbid / undercut, 1 gone, 2 cut (data stopped)
  };
  ah: {
    keys: string[];
    bins: { ts: number[]; key: number[]; lowest: (number | null)[]; second: (number | null)[]; bins: number[]; total: number[] }; // centicoins per item
    sales: { ts: number[]; key: number[]; price: number[]; bin: number[] };                                                   // centicoins per item
  };
  election: ElectionResponse[];
}

export const emptyDataFile = (name: string, kind: CollectorKind, version: string, source: DataSource = "poll"): DataFile => ({
  format: DATA_FORMAT, name, collector: { kind, version, source }, from: 0, to: 0, polls: [], items: [],
  closes: { poll: [], item: [], ask: [], bid: [], askVol: [], bidVol: [], askOrders: [], bidOrders: [], buyWeek: [], sellWeek: [] },
  flow: { hour: [], item: [], intervals: [], seconds: [], bidOutbid: [], askUndercut: [], bidRemoved: [], askRemoved: [], tradeIntervals: [], tradeSeconds: [], bidTrades: [], askTrades: [] },
  episodes: { item: [], side: [], start: [], dur: [], polls: [], flow: [], end: [] },
  ah: { keys: [], bins: { ts: [], key: [], lowest: [], second: [], bins: [], total: [] }, sales: { ts: [], key: [], price: [], bin: [] } },
  election: [],
});

// On disk: sorted columns are stored as differences from the previous value; hourly closes as differences from the same
// item's previous close (most items barely change from hour to hour); episode starts as poll numbers (an episode starts
// at a poll) with the rare start outside this file's polls kept in milliseconds.
const DELTA: [string, string][] = [["", "polls"], ["closes", "poll"], ["flow", "hour"], ["ah.bins", "ts"], ["ah.sales", "ts"]];
const PER_ITEM = ["ask", "bid", "askVol", "bidVol", "askOrders", "bidOrders", "buyWeek", "sellWeek"] as const;
const get = (f: Record<string, unknown>, path: string) => path.split(".").filter(Boolean).reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, f);
const delta = (xs: number[]) => xs.map((x, i) => (i ? x - xs[i - 1]! : x));
const undelta = (xs: number[]) => { const out = new Array<number>(xs.length); let acc = 0; for (let i = 0; i < xs.length; i++) out[i] = acc += xs[i]!; return out; };

/** JSON text for disk (gzip it). Throws if the file is inconsistent. */
export function encodeDataFile(f: DataFile): string {
  const errs = structureErrors(f);
  if (errs.length) throw new Error(`invalid data file: ${errs.slice(0, 5).join("; ")}`);
  const c = JSON.parse(JSON.stringify(f)) as DataFile & Record<string, unknown>;
  // closes: value minus the same item's previous close (null stays null and does not move the reference)
  for (const col of PER_ITEM) {
    const xs = c.closes[col] as (number | null)[], last = new Map<number, number>();
    for (let i = 0; i < xs.length; i++) {
      const v = xs[i], it = c.closes.item[i]!;
      if (v == null) continue;
      xs[i] = v - (last.get(it) ?? 0);
      last.set(it, v);
    }
  }
  // episodes: start as poll number, differences within the sorted list
  const pollIdx = new Map(f.polls.map((t, i) => [t, i]));
  const startPoll: number[] = [], startMs: number[] = [];
  for (const t of f.episodes.start) { const p = pollIdx.get(t); if (p == null) { startPoll.push(-1); startMs.push(t); } else startPoll.push(p); }
  const ep = c.episodes as unknown as Record<string, unknown>;
  delete ep.start;
  ep.startPoll = delta(startPoll);
  ep.startMs = startMs;
  for (const [obj, col] of DELTA) { const o = get(c, obj); o[col] = delta(o[col] as number[]); }
  return JSON.stringify({ ...c, encoding: "delta2" });
}

/** Parse what encodeDataFile wrote (after gunzip). Throws on a malformed file. */
export function decodeDataFile(text: string): DataFile {
  const c = JSON.parse(text) as Record<string, unknown>;
  if (c.format !== DATA_FORMAT) throw new Error(`not a ${DATA_FORMAT} file (format: ${String(c.format)})`);
  if (c.encoding !== "delta2") throw new Error(`unknown encoding ${String(c.encoding)}`);
  for (const [obj, col] of DELTA) {
    const o = get(c, obj);
    if (!o || !Array.isArray(o[col]) || (o[col] as unknown[]).some(x => typeof x !== "number")) throw new Error(`missing or bad column ${obj ? obj + "." : ""}${col}`);
    o[col] = undelta(o[col] as number[]);
  }
  const f = c as unknown as DataFile;
  const cl = f.closes as unknown as Record<string, unknown[]>;
  if (!cl || !Array.isArray(cl.item)) throw new Error("missing closes");
  for (const col of PER_ITEM) {
    const xs = cl[col] as (number | null)[];
    if (!Array.isArray(xs)) throw new Error(`missing closes.${col}`);
    const last = new Map<number, number>();
    for (let i = 0; i < xs.length; i++) {
      const v = xs[i], it = cl.item[i] as number;
      if (v == null) continue;
      if (typeof v !== "number") throw new Error(`bad closes.${col}`);
      const abs = v + (last.get(it) ?? 0);
      xs[i] = abs; last.set(it, abs);
    }
  }
  const ep = f.episodes as unknown as Record<string, unknown>;
  if (!ep || !Array.isArray(ep.startPoll) || !Array.isArray(ep.startMs)) throw new Error("missing episodes.startPoll");
  const sp = undelta(ep.startPoll as number[]), ms = ep.startMs as number[];
  let k = 0;
  ep.start = sp.map(p => (p === -1 ? ms[k++] : f.polls[p]));
  if (k !== ms.length || (ep.start as unknown[]).some(x => x === undefined)) throw new Error("bad episodes.startPoll");
  delete ep.startPoll; delete ep.startMs;
  delete c.encoding;
  const errs = structureErrors(f);
  if (errs.length) throw new Error(`invalid data file: ${errs.slice(0, 5).join("; ")}`);
  return f;
}

const isInt = (x: unknown) => typeof x === "number" && Number.isInteger(x);
const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);

/** Shape problems that make a file unusable (column lengths, indexes, types). */
export function structureErrors(f: DataFile): string[] {
  const e: string[] = [];
  const cols = (name: string, o: Record<string, unknown[]>, check: Record<string, (x: unknown) => boolean>) => {
    const lens = Object.keys(check).map(k => (Array.isArray(o?.[k]) ? o[k]!.length : -1));
    if (lens.some(l => l < 0)) { e.push(`${name}: missing columns`); return; }
    if (new Set(lens).size > 1) { e.push(`${name}: columns have different lengths`); return; }
    for (const [k, ok] of Object.entries(check)) { const bad = o[k]!.findIndex(x => !ok(x)); if (bad >= 0) { e.push(`${name}.${k}[${bad}] = ${JSON.stringify(o[k]![bad])}`); return; } }
  };
  if (!f || f.format !== DATA_FORMAT) return ["wrong format"];
  if (typeof f.name !== "string" || !/^[A-Za-z0-9-]{1,39}$/.test(f.name)) e.push("name must be a GitHub login");
  if (!["node", "browser", "export"].includes(f.collector?.kind)) e.push("collector.kind");
  if (!["poll", "wayback"].includes(f.collector?.source)) e.push("collector.source");
  if (!isInt(f.from) || !isInt(f.to) || f.to < f.from) e.push("from / to");
  if (!Array.isArray(f.polls) || f.polls.some((p, i) => !isInt(p) || (i > 0 && p <= f.polls[i - 1]!))) e.push("polls must be ascending integers");
  if (!Array.isArray(f.items) || f.items.some(x => typeof x !== "string" || !/^[A-Za-z0-9_:;.\-]{1,80}$/.test(x))) e.push("items");
  const P = f.polls?.length ?? 0, I = f.items?.length ?? 0, K = f.ah?.keys?.length ?? 0;
  const idx = (n: number) => (x: unknown) => isInt(x) && (x as number) >= 0 && (x as number) < n;
  const nn = (x: unknown) => isNum(x) && (x as number) >= 0;
  const cents = (x: unknown) => x === null || (isInt(x) && (x as number) > 0);
  cols("closes", f.closes as never, { poll: idx(P), item: idx(I), ask: cents, bid: cents, askVol: nn, bidVol: nn, askOrders: nn, bidOrders: nn, buyWeek: nn, sellWeek: nn });
  cols("flow", f.flow as never, { hour: isInt, item: idx(I), intervals: nn, seconds: nn, bidOutbid: nn, askUndercut: nn, bidRemoved: nn, askRemoved: nn });
  const tradeCols = ["tradeIntervals", "tradeSeconds", "bidTrades", "askTrades"] as const;
  const present = tradeCols.filter(k => (f.flow as Record<string, unknown>)?.[k] !== undefined);
  if (present.length && present.length < tradeCols.length) e.push("flow: trade columns must come together");
  else if (present.length) {
    if (f.flow.tradeIntervals!.length !== f.flow.item.length) e.push("flow: trade columns have a different length");
    else cols("flow", f.flow as never, { tradeIntervals: nn, tradeSeconds: nn, bidTrades: nn, askTrades: nn });
  }
  cols("episodes", f.episodes as never, { item: idx(I), side: (x: unknown) => x === 0 || x === 1, start: isInt, dur: nn, polls: (x: unknown) => isInt(x) && (x as number) >= 1, flow: nn, end: (x: unknown) => x === 0 || x === 1 || x === 2 });
  if (!Array.isArray(f.ah?.keys) || f.ah.keys.some(x => typeof x !== "string" || x.length > 120)) e.push("ah.keys");
  cols("ah.bins", f.ah?.bins as never, { ts: isInt, key: idx(K), lowest: cents, second: cents, bins: nn, total: nn });
  cols("ah.sales", f.ah?.sales as never, { ts: isInt, key: idx(K), price: (x: unknown) => isInt(x) && (x as number) > 0, bin: (x: unknown) => x === 0 || x === 1 });
  if (!Array.isArray(f.election)) e.push("election");
  return e;
}

/** File name a contribution must have: <login>_<UTC start yyyymmddThhmm>[_<suffix>].json.gz */
export const dataFileName = (f: Pick<DataFile, "name" | "from">) =>
  `${f.name}_${new Date(f.from).toISOString().replace(/[-:]/g, "").slice(0, 13)}.json.gz`;
export const DATA_FILE_RE = /^([A-Za-z0-9-]{1,39})_(\d{8}T\d{4})(?:_[a-z0-9]{1,12})?\.json\.gz$/;

export interface Coverage { polls: number; hours: number; from: number; to: number; items: number; closes: number; episodes: number; sales: number; bins: number }
/** Hours of polling (gaps over 150 s do not count) and row counts. */
export function coverage(f: DataFile): Coverage {
  let s = 0;
  for (let i = 1; i < f.polls.length; i++) { const g = f.polls[i]! - f.polls[i - 1]!; if (g <= 150_000) s += g; }
  return { polls: f.polls.length, hours: s / 3.6e6, from: f.from, to: f.to, items: f.items.length, closes: f.closes.item.length, episodes: f.episodes.item.length, sales: f.ah.sales.ts.length, bins: f.ah.bins.ts.length };
}

/**
 * Plausibility checks beyond the structure (things a broken or edited collector would get wrong). Errors make the
 * file unusable; warnings are shown to the maintainer who approves it.
 */
export function sanityCheck(f: DataFile, now = Date.now()): { errors: string[]; warnings: string[] } {
  const errors = structureErrors(f), warnings: string[] = [];
  if (errors.length) return { errors, warnings };
  const first = f.polls[0], last = f.polls.at(-1);
  if (f.to > now + 5 * 60_000) errors.push(`ends in the future (${new Date(f.to).toISOString()})`);
  if (f.from < Date.UTC(2019, 0, 1)) errors.push("starts before 2019");
  if (f.to - f.from > 8 * 86400_000) errors.push("covers more than 8 days (split it into days)");
  if (first != null && (first < f.from - 1 || last! > f.to + 1)) errors.push("polls outside from / to");
  if (f.collector.source === "poll" && f.polls.length > 1) {
    const gaps = f.polls.slice(1).map((p, i) => p - f.polls[i]!).sort((a, b) => a - b);
    const med = gaps[gaps.length >> 1]!;
    if (gaps[0]! < 5_000) errors.push(`two polls ${gaps[0]} ms apart (Hypixel refreshes the bazaar about every 20 s)`);
    if (med > 120_000) warnings.push(`median gap between polls is ${Math.round(med / 1000)} s: time-on-top and flow need polls at most ~60 s apart`);
  }
  // closes: last poll of an hour per item, prices sane
  const seen = new Set<string>();
  let crossed = 0, priced = 0;
  for (let i = 0; i < f.closes.item.length; i++) {
    const t = f.polls[f.closes.poll[i]!]!, k = `${f.closes.item[i]}|${Math.floor(t / 3.6e6)}`;
    if (seen.has(k)) { errors.push(`two closes for ${f.items[f.closes.item[i]!]} in hour ${new Date(Math.floor(t / 3.6e6) * 3.6e6).toISOString()}`); break; }
    seen.add(k);
    const a = f.closes.ask[i], b = f.closes.bid[i];
    if (a != null && b != null) { priced++; if (b > a) crossed++; }
    if ((a ?? 0) > 1e14 || (b ?? 0) > 1e14) { errors.push(`price above 1T coins for ${f.items[f.closes.item[i]!]}`); break; }
  }
  // the bazaar never shows a buy order above the best sell offer (they would have matched); allow rounding noise
  if (priced > 50 && crossed / priced > 0.01) errors.push(`${crossed} of ${priced} closes have the best buy order above the best sell offer`);
  const fh = new Set<string>();
  for (let i = 0; i < f.flow.item.length; i++) {
    const k = `${f.flow.item[i]}|${f.flow.hour[i]}`;
    if (fh.has(k)) { errors.push("two flow rows for one item and hour"); break; }
    fh.add(k);
    if (f.flow.seconds[i]! > 3600 * 1.01) { errors.push(`flow row with ${f.flow.seconds[i]} s in one hour`); break; }
    if (f.flow.tradeSeconds && f.flow.tradeSeconds[i]! > f.flow.seconds[i]! + 0.1) { errors.push("flow row with more trade seconds than seconds"); break; }
    const h = f.flow.hour[i]! * 3.6e6;
    if (h < f.from - 3.6e6 || h > f.to) { errors.push("flow row outside the file's time span"); break; }
  }
  for (let i = 0; i < f.episodes.item.length; i++) {
    if (f.episodes.start[i]! > f.to + 1 || f.episodes.start[i]! + f.episodes.dur[i]! * 100 > f.to + 300_000) { errors.push("episode outside the file's time span"); break; }
  }
  for (let i = 0; i < f.ah.sales.ts.length; i++) if (f.ah.sales.ts[i]! < f.from - 3.6e6 || f.ah.sales.ts[i]! > f.to + 60_000) { errors.push("auction sale outside the file's time span"); break; }
  if (f.collector.source === "poll" && f.polls.length && !f.closes.item.length) warnings.push("no hourly closes");
  return { errors, warnings };
}

/** File name for an item id in the website's data folder (ids can contain ":" and ";"). */
export const siteFileId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, c => `~${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
