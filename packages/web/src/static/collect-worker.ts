// Browser collector: polls Hypixel's public endpoints from this tab and records them into contribution data files
// (packages/shared/src/data), the same format the Node collector writes. Runs in a Web Worker; progress is saved in
// the browser (IndexedDB) every few minutes so closing the tab does not lose what was recorded.
import { type AuctionsPage, type BazaarResponse, type ElectionResponse, type EndedAuctions, DataCollector, HYPIXEL, aggregateBins, auctionItemKey, coverage, dataFileName, encodeDataFile } from "@bc/shared";

export const COLLECTOR_VERSION = "browser-1";
const BAZAAR_EVERY = 20_000, ENDED_EVERY = 30_000, ELECTION_EVERY = 3600_000, BINS_EVERY = 30 * 60_000, SAVE_EVERY = 5 * 60_000;

type Msg = { type: "start"; name: string; auctions: boolean } | { type: "stop" } | { type: "status" } | { type: "file"; key: string } | { type: "delete"; key: string };
export interface CollectStatus {
  running: boolean; name: string | null; startedAt: number | null; polls: number; hours: number; lastPoll: number | null; medianGapS: number | null; sales: number; binScans: number;
  rejected: { ts: number; reason: string }[]; errors: string[]; files: { key: string; name: string; bytes: number; hours: number; from: number; to: number }[];
}

// ---- IndexedDB: finished files (gzipped) and the file being recorded (encoded text)
const dbp = new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("bazaar-calc-collector", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => { const db = await dbp; return new Promise<T>((res, rej) => { const r = fn(db.transaction("files", mode).objectStore("files")); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); };
const put = (k: string, v: unknown) => tx("readwrite", s => s.put(v, k));
const get = <T>(k: string) => tx<T | undefined>("readonly", s => s.get(k) as IDBRequest<T | undefined>);
const del = (k: string) => tx("readwrite", s => s.delete(k));
const keys = () => tx<IDBValidKey[]>("readonly", s => s.getAllKeys());

const gzip = async (text: string) => new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const gunzip = async (b: Uint8Array) => new Uint8Array(await new Response(new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
const b64 = (s: string) => { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const itemKey = async (itemBytes: string) => { try { return auctionItemKey(await gunzip(b64(itemBytes))); } catch { return null; } };

let col: DataCollector | null = null;
let name: string | null = null, startedAt: number | null = null, auctions = false;
let timers: ReturnType<typeof setTimeout>[] = [];
let sales = 0, binScans = 0;
const errors: string[] = [];
const gaps: number[] = [];
let lastPoll: number | null = null;
const note = (e: unknown) => { errors.unshift(`${new Date().toISOString().slice(11, 19)} ${(e as Error).message ?? e}`); errors.length = Math.min(errors.length, 8); };

/** A free file name: <login>_<start>.json.gz, or with _2, _3 ... when two files start in the same minute. */
async function uniqueName(base: string) {
  for (let i = 1; ; i++) { const n = i === 1 ? base : base.replace(".json.gz", `_${i}.json.gz`); if (!(await get(`done:${n}`))) return n; }
}

/** Close the current file into the finished list (gzipped). */
async function finish(c: DataCollector) {
  if (!c.hasData) return;
  const f = c.snapshot();
  const fileName = await uniqueName(dataFileName(f));
  const gz = await gzip(encodeDataFile(f));
  const cv = coverage(f);
  await put(`done:${fileName}`, { name: fileName, gz, hours: cv.hours, from: f.from, to: f.to });
  await del("current");
}

async function save() {
  if (!col?.hasData) return;
  const f = col.snapshot();
  await put("current", { text: encodeDataFile(f), from: f.from, to: f.to, hours: coverage(f).hours, name: f.name });
}

/** A file saved by an earlier session (tab closed while recording) becomes a finished file. */
async function recover() {
  const cur = await get<{ text: string; from: number; name: string; hours: number; to: number }>("current");
  if (!cur) return;
  const fileName = await uniqueName(dataFileName({ name: cur.name, from: cur.from }));
  await put(`done:${fileName}`, { name: fileName, gz: await gzip(cur.text), hours: cur.hours, from: cur.from, to: cur.to });
  await del("current");
}

const loop = (fn: () => Promise<void>, every: number) => {
  const run = async () => { const t0 = Date.now(); try { await fn(); } catch (e) { note(e); } timers.push(setTimeout(run, Math.max(1000, every - (Date.now() - t0)))); };
  timers.push(setTimeout(run, 0));
};

async function pollBazaar() {
  const r = await fetch(`${HYPIXEL}/skyblock/bazaar`, { cache: "no-store" });
  if (!r.ok) throw new Error(`bazaar: HTTP ${r.status}`);
  const d = (await r.json()) as BazaarResponse;
  // a new UTC day starts a new file (time-on-top tracking carries on)
  if (col!.hasData && col!.from && Math.floor(d.lastUpdated / 86400_000) !== Math.floor(col!.from / 86400_000)) { await finish(col!); col!.reset(); }
  if (col!.addBazaar(d) === "accepted") { if (lastPoll) { gaps.push((d.lastUpdated - lastPoll) / 1000); if (gaps.length > 200) gaps.shift(); } lastPoll = d.lastUpdated; }
  post();
}
async function pollEnded() {
  const r = await fetch(`${HYPIXEL}/skyblock/auctions_ended`, { cache: "no-store" });
  if (!r.ok) throw new Error(`auctions_ended: HTTP ${r.status}`);
  const d = (await r.json()) as EndedAuctions;
  const list: { key: string; ts: number; price: number; bin: boolean }[] = [];
  for (const a of d.auctions ?? []) { const info = await itemKey(a.item_bytes); if (info) list.push({ key: info.key, ts: a.timestamp, price: a.price / info.count, bin: a.bin }); }
  sales += col!.addSales(list);
}
async function pollElection() {
  const r = await fetch(`${HYPIXEL}/resources/skyblock/election`, { cache: "no-store" });
  if (r.ok) col!.addElection((await r.json()) as ElectionResponse);
}
async function scanBins() {
  const page = async (n: number) => { const r = await fetch(`${HYPIXEL}/skyblock/auctions?page=${n}`, { cache: "no-store" }); if (!r.ok) throw new Error(`auctions page ${n}: HTTP ${r.status}`); return (await r.json()) as AuctionsPage; };
  const first = await page(0), rest: AuctionsPage[] = [];
  for (let i = 1; i < first.totalPages; i += 4) rest.push(...await Promise.all(Array.from({ length: Math.min(4, first.totalPages - i) }, (_, j) => page(i + j))));
  if (rest.length !== first.totalPages - 1) return; // incomplete scans are never stored
  const agg = await aggregateBins(first.auctions, itemKey);
  for (const p of rest) await aggregateBins(p.auctions, itemKey, agg);
  col!.addBinScan(first.lastUpdated, agg);
  binScans++;
}

async function status(): Promise<CollectStatus> {
  const files = [];
  for (const k of await keys()) if (String(k).startsWith("done:")) { const f = await get<{ name: string; gz: Uint8Array; hours: number; from: number; to: number }>(String(k)); if (f) files.push({ key: String(k), name: f.name, bytes: f.gz.byteLength, hours: f.hours, from: f.from, to: f.to }); }
  const s = [...gaps].sort((a, b) => a - b);
  return { running: !!col && timers.length > 0, name, startedAt, polls: col?.polls ?? 0, hours: col?.hours ?? 0, lastPoll, medianGapS: s.length ? s[s.length >> 1]! : null, sales, binScans,
    rejected: col?.rejected.slice(-5) ?? [], errors: [...errors], files: files.sort((a, b) => a.from - b.from) };
}
const post = () => void status().then(s => (self as unknown as Worker).postMessage({ type: "status", status: s }));

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === "start" && !timers.length) {
      await recover();
      name = m.name; auctions = m.auctions; startedAt = Date.now(); sales = 0; binScans = 0; gaps.length = 0; lastPoll = null;
      col = new DataCollector(m.name, "browser", COLLECTOR_VERSION);
      loop(pollBazaar, BAZAAR_EVERY);
      loop(pollEnded, ENDED_EVERY);
      loop(pollElection, ELECTION_EVERY);
      if (auctions) loop(scanBins, BINS_EVERY);
      timers.push(setInterval(() => void save().catch(note), SAVE_EVERY) as unknown as ReturnType<typeof setTimeout>);
    } else if (m.type === "stop") {
      timers.forEach(t => clearTimeout(t)); timers = [];
      if (col) { col.flush(); await finish(col); col = null; }
    } else if (m.type === "file") {
      const f = await get<{ name: string; gz: Uint8Array }>(m.key);
      if (f) (self as unknown as Worker).postMessage({ type: "file", name: f.name, gz: f.gz });
      return;
    } else if (m.type === "delete") {
      await del(m.key);
    }
  } catch (err) { note(err); }
  post();
};
