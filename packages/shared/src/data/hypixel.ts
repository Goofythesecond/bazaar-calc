// Hypixel Public API shapes and checks shared by the server, the collectors and the static website.
import type { BookLevel } from "../market/index.js";

export const HYPIXEL = "https://api.hypixel.net/v2";

export interface HypixelOrder { amount: number; pricePerUnit: number; orders: number }
export interface HypixelProduct {
  product_id: string;
  sell_summary: HypixelOrder[];
  buy_summary: HypixelOrder[];
  quick_status: { buyPrice: number; sellPrice: number; buyVolume: number; sellVolume: number; buyMovingWeek: number; sellMovingWeek: number; buyOrders: number; sellOrders: number };
}
export interface BazaarResponse { success: boolean; lastUpdated: number; products: Record<string, HypixelProduct> }

export interface Auction { uuid: string; item_bytes: string; bin: boolean; starting_bid: number; highest_bid_amount: number; end: number; start: number; claimed: boolean; item_name: string; tier: string }
export interface AuctionsPage { success: boolean; page: number; totalPages: number; lastUpdated: number; auctions: Auction[] }
export interface EndedAuction { auction_id: string; item_bytes: string; bin: boolean; price: number; timestamp: number }
export interface EndedAuctions { success: boolean; lastUpdated: number; auctions: EndedAuction[] }
export interface ElectionResponse {
  success: boolean; lastUpdated: number;
  mayor?: { key: string; name: string; perks: { name: string; description?: string }[]; minister?: { key: string; name: string; perk?: { name: string } };
    election?: { year: number; candidates: { key: string; name: string; votes?: number; perks: { name: string }[] }[] } };
  current?: { year: number; candidates: { key: string; name: string; votes?: number; perks: { name: string; minister?: boolean }[] }[] };
}

/** Strict shape check for bazaar payloads (our own polls, collectors and contributor uploads). */
export function validateBazaar(d: unknown, now = Date.now()): string | null {
  const b = d as BazaarResponse;
  if (!b || b.success !== true) return "success must be true";
  if (typeof b.lastUpdated !== "number") return "lastUpdated missing";
  if (b.lastUpdated > now + 120_000) return "lastUpdated is in the future";
  if (b.lastUpdated < now - 30 * 86400_000) return "lastUpdated older than 30 days";
  const products = Object.values(b.products ?? {});
  if (products.length < 500) return `only ${products.length} products`;
  for (const p of products.slice(0, 50)) {
    if (!p.quick_status || !Array.isArray(p.sell_summary) || !Array.isArray(p.buy_summary)) return `malformed product ${p.product_id}`;
  }
  return null;
}

/**
 * Hypixel occasionally serves a degraded response (seen 2026-10-02 00:10Z: 1,866 of 2,197 products, every weekly volume
 * 0). Storing it would zero every flow estimate until the next poll, so it is dropped. `prevCount`: products in the last
 * accepted poll (0 if none).
 */
export function degradedBazaar(d: BazaarResponse, prevCount: number): string | null {
  const products = Object.values(d.products);
  if (prevCount && products.length < 0.95 * prevCount) return `only ${products.length} products (last poll had ${prevCount})`;
  const zeroVolume = products.filter(p => !p.quick_status?.buyMovingWeek && !p.quick_status?.sellMovingWeek).length;
  if (zeroVolume > 0.5 * products.length) return `${zeroVolume} of ${products.length} products report no weekly volume`;
  return null;
}

/** What changed at the top of the book between two snapshots. Removed units = filled or cancelled. */
export function bookFlow(prevBids: BookLevel[], prevAsks: BookLevel[], bids: HypixelOrder[], asks: HypixelOrder[]) {
  const bestBid = bids[0]?.pricePerUnit ?? 0, bestAsk = asks[0]?.pricePerUnit ?? Infinity;
  // units now at a price: a scan of at most 30 levels (no lookup map per item and poll: the scanner runs this every 20 s)
  const at = (side: HypixelOrder[], cents: number) => { for (const o of side) if (Math.round(o.pricePerUnit * 100) === cents) return o.amount; return 0; };
  let bidRemoved = 0, askRemoved = 0;
  for (const l of prevBids) if (l.price >= bestBid) bidRemoved += Math.max(0, l.amount - at(bids, Math.round(l.price * 100)));
  for (const l of prevAsks) if (l.price <= bestAsk) askRemoved += Math.max(0, l.amount - at(asks, Math.round(l.price * 100)));
  return {
    bidRemoved, askRemoved,
    outbid: prevBids[0] != null && bestBid > prevBids[0].price + 1e-9,
    undercut: prevAsks[0] != null && bestAsk < prevAsks[0].price - 1e-9,
  };
}

/**
 * Real instant trades between two polls from Hypixel's 7-day counters: the rise of sellMovingWeek is units instant-sold
 * (they filled buy orders), the rise of buyMovingWeek units instant-bought (they filled sell offers). The counters also
 * fall in bulk when week-old trades expire (about every 30 min); in such a pair the trades are unknown, so null.
 */
export function counterTrades(prev: { buyWeek: number; sellWeek: number }, now: { buyWeek: number; sellWeek: number }): { bid: number; ask: number } | null {
  const bid = now.sellWeek - prev.sellWeek, ask = now.buyWeek - prev.buyWeek;
  return bid < 0 || ask < 0 ? null : { bid, ask };
}

/** Book levels as stored (prices rounded to centicoins, exactly as the database packs them). */
export const toLevels = (o: HypixelOrder[]): BookLevel[] => o.map(x => ({ price: Math.round(x.pricePerUnit * 100) / 100, amount: x.amount, orders: x.orders }));
