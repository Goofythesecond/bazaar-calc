// Assemble the calculator's Market from current bazaar prices plus derived statistics. Used by the server (from its
// database) and by the static website (live Hypixel prices in the browser + the published statistics), so both
// calculate from exactly the same inputs.
import type { HoldStats } from "./calc/sizing.js";
import { type BookLevel, type ItemMarket, computeFlags, flagBookLadders } from "./market.js";
import { prettyName } from "./names.js";
import type { EventImpact } from "./analysis.js";

/** Per-item statistics (server: item_stats.data; website: market.json). */
export interface ItemStats {
  askMed: number | null; bidMed: number | null; spreadMed: number | null; days: number;
  undercutBuyH: number | null; undercutSellH: number | null; liveHours: number;
  observedBuyFlowH?: number | null; observedSellFlowH?: number | null;
  hourAgo: { ask: number | null; bid: number | null } | null;
  spark: (number | null)[]; chg24: number | null; chg7: number | null; chg14: number | null; volDaily: number | null;
  ask24?: number | null; bid24?: number | null; n24?: number; ask7?: number | null; bid7?: number | null; n7?: number;
  askVol24?: number | null; bidVol24?: number | null;
  delists?: { hours: number; bidRemoved: number; bidTrades: number; askRemoved: number; askTrades: number } | null;
  eventImpact?: EventImpact[];
}

/** Current state of one bazaar product (coins). */
export interface LiveQuote {
  id: string; ts: number; ask: number | null; bid: number | null;
  askVolume: number; bidVolume: number; askOrders: number; bidOrders: number; ibuyWeek: number; isellWeek: number;
  bids: BookLevel[]; asks: BookLevel[];
}

/** Auction-house reference for one item key (coins per item). */
export interface AhRef { lowestBin: number | null; sales24h: number; medianSale24h: number | null }

export interface MarketInputs {
  quotes: LiveQuote[];
  stats: Map<string, ItemStats>;
  hold: Map<string, { bid?: HoldStats; ask?: HoldStats }>;
  /** only auction rows recent enough to trade on */
  ah: Map<string, AhRef>;
  names: Map<string, string | null>;
  /** wall-clock time for auction-only rows */
  now?: number;
}

export function assembleMarket(inp: MarketInputs): Map<string, ItemMarket> {
  const out = new Map<string, ItemMarket>();
  for (const r of inp.quotes) {
    const s = inp.stats.get(r.id);
    const a = inp.ah.get(r.id);
    const m: ItemMarket = {
      id: r.id, name: prettyName(r.id, inp.names.get(r.id)), ts: r.ts, ask: r.ask, bid: r.bid,
      askVolume: r.askVolume, bidVolume: r.bidVolume, askOrders: r.askOrders, bidOrders: r.bidOrders, ibuyWeek: r.ibuyWeek, isellWeek: r.isellWeek,
      undercutBuyH: s?.undercutBuyH ?? null, undercutSellH: s?.undercutSellH ?? null, liveHours: s?.liveHours ?? 0,
      observedBuyFlowH: s?.observedBuyFlowH ?? null, observedSellFlowH: s?.observedSellFlowH ?? null,
      ref: s ? { askMed: s.askMed, bidMed: s.bidMed, spreadMed: s.spreadMed, days: s.days, ask24: s.ask24 ?? null, bid24: s.bid24 ?? null, n24: s.n24 ?? 0,
        ask7: s.ask7 ?? null, bid7: s.bid7 ?? null, n7: s.n7 ?? 0, askVol24: s.askVol24 ?? null, bidVol24: s.bidVol24 ?? null, delists: s.delists ?? null } : null,
      topBid: r.bids, topAsk: r.asks,
      holdBid: inp.hold.get(r.id)?.bid ?? null, holdAsk: inp.hold.get(r.id)?.ask ?? null,
      ahLowestBin: a?.lowestBin ?? null, ahSales24h: a?.sales24h ?? 0, ahMedianSale24h: a?.medianSale24h ?? null,
      flags: [], flagWhy: {},
    };
    computeFlags(m, s?.hourAgo ?? undefined);
    out.set(m.id, m);
  }
  // a product Hypixel stopped listing keeps its last row: never trade on prices that stopped updating
  const newest = Math.max(0, ...[...out.values()].map(m => m.ts));
  for (const m of out.values()) if (newest - m.ts > 15 * 60_000) {
    m.ask = null; m.bid = null; m.flags.push("stale");
    m.flagWhy.stale = `no update from Hypixel for ${Math.round((newest - m.ts) / 60_000)} min (not listed on the bazaar right now)`;
  }
  flagBookLadders(out);
  // auction-only items (forge outputs etc.) as reference prices
  for (const [key, a] of inp.ah) {
    if (out.has(key) || a.lowestBin == null) continue;
    out.set(key, { id: key, name: prettyName(key, inp.names.get(key)), ts: inp.now ?? Date.now(), ask: null, bid: null, askVolume: 0, bidVolume: 0, askOrders: 0, bidOrders: 0,
      ibuyWeek: 0, isellWeek: 0, undercutBuyH: null, undercutSellH: null, liveHours: 0, ahLowestBin: a.lowestBin, ahSales24h: a.sales24h,
      ahMedianSale24h: a.medianSale24h, flags: ["auction_only"], flagWhy: { auction_only: "not on the bazaar; auction-house price shown" } });
  }
  return out;
}

/** Hypixel bazaar response -> live quotes (exactly what the server stores as bazaar_latest). */
export function quotesFromBazaar(d: { lastUpdated: number; products: Record<string, { sell_summary: { pricePerUnit: number; amount: number; orders: number }[]; buy_summary: { pricePerUnit: number; amount: number; orders: number }[];
  quick_status: { buyVolume: number; sellVolume: number; buyOrders: number; sellOrders: number; buyMovingWeek: number; sellMovingWeek: number } }> }): LiveQuote[] {
  const lv = (o: { pricePerUnit: number; amount: number; orders: number }[]) => o.map(x => ({ price: Math.round(x.pricePerUnit * 100) / 100, amount: Math.round(x.amount), orders: x.orders }));
  return Object.entries(d.products).map(([id, p]) => {
    const q = p.quick_status, bids = p.sell_summary ?? [], asks = p.buy_summary ?? [];
    return { id, ts: d.lastUpdated,
      ask: asks[0] ? Math.round(asks[0].pricePerUnit * 100) / 100 : null, bid: bids[0] ? Math.round(bids[0].pricePerUnit * 100) / 100 : null,
      askVolume: q.buyVolume ?? 0, bidVolume: q.sellVolume ?? 0, askOrders: q.buyOrders ?? 0, bidOrders: q.sellOrders ?? 0,
      ibuyWeek: q.buyMovingWeek ?? 0, isellWeek: q.sellMovingWeek ?? 0, bids: lv(bids), asks: lv(asks) };
  });
}
