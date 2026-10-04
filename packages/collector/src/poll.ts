// Polling loops shared by the collector (files for pull requests) and the scanner (always on, pushes to GitHub): Hypixel's
// public bazaar every 20 s, ended auctions every 30 s, the election hourly and, optionally, a lowest-BIN scan of every
// auction page. Everything goes into a DataCollector (packages/shared, data module), exactly as the server records it.
import zlib from "node:zlib";
import { type AuctionsPage, type BazaarResponse, type DataCollector, type ElectionResponse, type EndedAuctions, HYPIXEL, aggregateBins, auctionItemKey } from "@bc/shared";

export interface PollOptions {
  ua: string;
  bins: boolean;
  binsEveryMs: number;
  log: (...a: unknown[]) => void;
  /** before a new bazaar response is recorded (the collector starts a new file at 00:00 UTC here) */
  beforeBazaar?: (d: BazaarResponse) => void;
  /** after a bazaar response was recorded (the scanner's paper trading follows it) */
  afterBazaar?: (d: BazaarResponse) => void;
}
export interface PollCounts { sales: number; scans: number; errors: number }

/** Pages of the auction scan fetched at once. Each page is added up and dropped as soon as it arrives, so memory holds a
 *  few pages, not all ~45 (keeping every page before adding them up peaked at 431 MB, measured 2026-10-03). */
const BIN_WORKERS = 2;

export function startPolling(col: DataCollector, o: PollOptions): { counts: PollCounts; stop: () => void } {
  const lastModified = new Map<string, string>();
  /** GET JSON; null when unchanged since the last call (If-Modified-Since). Retries network errors and 429 / 5xx. */
  async function get<T>(url: string, ifChanged = false): Promise<T | null> {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const since = ifChanged ? lastModified.get(url) : undefined;
        const r = await fetch(url, { headers: { "user-agent": o.ua, ...(since ? { "if-modified-since": since } : {}) }, signal: AbortSignal.timeout(60_000) });
        if (r.status === 304) return null;
        if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} ${url}`), { fatal: true });
        const body = (await r.json()) as T;
        const lm = r.headers.get("last-modified");
        if (ifChanged && lm) lastModified.set(url, lm);
        return body;
      } catch (e) {
        last = e;
        if ((e as { fatal?: boolean }).fatal) break;
        await new Promise(res => setTimeout(res, 2000 * 2 ** i));
      }
    }
    throw last;
  }
  const itemKey = (b64: string) => { try { return auctionItemKey(new Uint8Array(zlib.gunzipSync(Buffer.from(b64, "base64")))); } catch { return null; } };
  const counts: PollCounts = { sales: 0, scans: 0, errors: 0 };
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;

  const loop = (name: string, every: number, fn: () => Promise<void>) => {
    const run = async () => {
      const t0 = Date.now();
      try { await fn(); } catch (e) { counts.errors++; o.log(`${name} failed: ${(e as Error).message}`); }
      if (stopped) return;
      const t = setTimeout(() => { timers.delete(t); void run(); }, Math.max(1000, every - (Date.now() - t0)));
      timers.add(t);
    };
    void run();
  };

  loop("bazaar", 20_000, async () => {
    const d = await get<BazaarResponse>(`${HYPIXEL}/skyblock/bazaar`, true);
    if (!d) return;
    o.beforeBazaar?.(d);
    if (col.addBazaar(d) === "rejected") { o.log(`bazaar response skipped: ${col.rejected.at(-1)?.reason}`); return; }
    o.afterBazaar?.(d);
  });
  // the endpoint lists about the last minute of sales: every 30 s so none fall between two polls
  loop("auctions_ended", 30_000, async () => {
    const d = await get<EndedAuctions>(`${HYPIXEL}/skyblock/auctions_ended`, true);
    if (!d) return;
    const list = [];
    for (const a of d.auctions ?? []) { const k = itemKey(a.item_bytes); if (k) list.push({ key: k.key, ts: a.timestamp, price: a.price / k.count, bin: a.bin }); }
    counts.sales += col.addSales(list);
  });
  loop("election", 3600_000, async () => { const d = await get<ElectionResponse>(`${HYPIXEL}/resources/skyblock/election`); if (d) col.addElection(d); });
  if (o.bins) loop("auction BIN scan", o.binsEveryMs, async () => {
    const first = await get<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=0`);
    if (!first) return;
    const total = first.totalPages, ts = first.lastUpdated;
    const agg = await aggregateBins(first.auctions, a => itemKey(a));
    first.auctions = [];
    let next = 1, done = 1, failed: string | null = null;
    const worker = async () => {
      while (!failed && next < total) {
        const i = next++;
        try {
          const p = await get<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=${i}`);
          if (!p) { failed = `page ${i} empty`; return; }
          await aggregateBins(p.auctions, a => itemKey(a), agg);
          done++;
        } catch (e) { failed = `page ${i}: ${(e as Error).message}`; }
      }
    };
    await Promise.all(Array.from({ length: BIN_WORKERS }, worker));
    if (failed || done !== total) { o.log(`auction scan incomplete (${failed ?? `${done} of ${total} pages`}), not stored`); return; } // incomplete scans are never stored
    col.addBinScan(ts, agg);
    counts.scans++;
  });
  return { counts, stop: () => { stopped = true; for (const t of timers) clearTimeout(t); timers.clear(); } };
}
