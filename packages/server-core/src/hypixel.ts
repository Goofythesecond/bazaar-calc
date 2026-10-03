// Hypixel Public API client (key-less endpoints only, except the optional profile import).
import { HYPIXEL, type AuctionsPage, type BazaarResponse, type ElectionResponse, type EndedAuctions } from "@bc/shared";
export { HYPIXEL, validateBazaar, type Auction, type AuctionsPage, type BazaarResponse, type ElectionResponse, type EndedAuction, type EndedAuctions, type HypixelOrder, type HypixelProduct } from "@bc/shared";
const UA = "bazaar-calc (open-source SkyBlock market calculator)";

export async function getJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} ${url}`), { fatal: true });
      return (await r.json()) as T;
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
  throw last;
}

/**
 * Like getJson, but only downloads when the response changed since the last time we fetched this URL: Hypixel (via
 * Cloudflare) answers If-Modified-Since with "304 Not Modified" and no body. Returns null when nothing changed.
 * The bazaar is polled every 20 s and refreshes about that often, so this saves the repeat downloads; for the 45-page
 * auction scan it skips the whole scan when page 0 has not changed.
 */
const lastModified = new Map<string, string>();
export async function getJsonIfChanged<T>(url: string, retries = 3): Promise<T | null> {
  let last: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const since = lastModified.get(url);
      const r = await fetch(url, { headers: { "user-agent": UA, ...(since ? { "if-modified-since": since } : {}) }, signal: AbortSignal.timeout(60_000) });
      if (r.status === 304) return null;
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status} ${url}`), { fatal: true });
      const body = (await r.json()) as T;
      const lm = r.headers.get("last-modified");
      if (lm) lastModified.set(url, lm);
      return body;
    } catch (e) {
      last = e;
      if ((e as { fatal?: boolean }).fatal) break;
      await new Promise(res => setTimeout(res, 2000 * 2 ** i));
    }
  }
  throw last;
}

export const fetchBazaar = () => getJson<BazaarResponse>(`${HYPIXEL}/skyblock/bazaar`);
/** null when the bazaar has not changed since our last poll (nothing downloaded) */
export const fetchBazaarIfChanged = () => getJsonIfChanged<BazaarResponse>(`${HYPIXEL}/skyblock/bazaar`);
export const fetchAuctionsPage = (page: number) => getJson<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=${page}`);
export const fetchAuctionsEnded = () => getJson<EndedAuctions>(`${HYPIXEL}/skyblock/auctions_ended`);
export const fetchAuctionsEndedIfChanged = () => getJsonIfChanged<EndedAuctions>(`${HYPIXEL}/skyblock/auctions_ended`);
export const fetchAuctionsPage0IfChanged = () => getJsonIfChanged<AuctionsPage>(`${HYPIXEL}/skyblock/auctions?page=0`);
export const fetchItems = () => getJson<{ success: boolean; items: { id: string; name?: string; category?: string; tier?: string; material?: string; npc_sell_price?: number }[] }>(`${HYPIXEL}/resources/skyblock/items`);
export const fetchElection = () => getJson<ElectionResponse>(`${HYPIXEL}/resources/skyblock/election`);
export const fetchCollections = () => getJson<{ success: boolean; collections: Record<string, { name: string; items: Record<string, { name: string; maxTiers: number; tiers: { tier: number; amountRequired: number }[] }> }> }>(`${HYPIXEL}/resources/skyblock/collections`);

