// Your own bazaar orders (typed in by you; nothing reads your account), followed against every new order-book snapshot.
// Queue rules (the same as Coflnet's open-source SkyBazaar matcher, and our fill model):
//  - orders at one price fill first come, first served: when you add an order, everything already at your price is
//    counted ahead of you
//  - units leaving your price level (fills or cancels: polls cannot tell) and real instant trades reaching your price
//    (Hypixel's counters, see counterTrades in hypixel.ts of the data module) move you up the queue; past the front they fill you
//  - the best price moving strictly past yours (a lower best buy order than your buy order, a higher best sell offer than
//    your sell offer) means your order was used up: filled, confirmed
//  - being outbid or undercut alone proves nothing: your order still waits behind the better price
// Everything before "confirmed" is an estimate and is shown as one.
import type { BookLevel } from "../market/index.js";

export type OrderSide = "buy" | "sell";
export type TrackedStatus = "top" | "behind" | "filled";

export interface TrackedOrder {
  id: string;
  item: string;
  name: string;
  side: OrderSide;
  price: number;
  amount: number;
  createdAt: number;
  /** units in front of you at your price (estimate) */
  ahead: number;
  /** units filled so far (estimate until `confirmed`) */
  filled: number;
  confirmed: boolean;
  /** your units have shown up at your price (until then the snapshot may predate your order: nothing is concluded) */
  seen: boolean;
  status: TrackedStatus;
  /** best price on your side at the last update */
  best: number | null;
  /** units at your price at the last update */
  level: number;
  /** better-priced units in front of yours at the last update (they fill before you) */
  better: number;
  /** Hypixel's counters at the last update (to count real trades) */
  buyWeek: number | null;
  sellWeek: number | null;
  updatedAt: number;
  /** optional link to a decision in the journal */
  decisionId?: string;
}

export interface BookSnapshot { ts: number; bids: BookLevel[]; asks: BookLevel[]; buyWeek: number; sellWeek: number }

export type OrderEvent =
  | { type: "outbid"; order: TrackedOrder; by: number; relist: number }
  | { type: "top"; order: TrackedOrder }
  | { type: "partial"; order: TrackedOrder; filled: number }
  | { type: "filled"; order: TrackedOrder; confirmed: boolean };

const cents = (p: number) => Math.round(p * 100);
const levels = (b: BookSnapshot, side: OrderSide) => (side === "buy" ? b.bids : b.asks);
/** strictly better for the order book side: a higher buy order, a lower sell offer */
const better = (side: OrderSide, a: number, b: number) => (side === "buy" ? cents(a) > cents(b) : cents(a) < cents(b));

function look(side: OrderSide, price: number, b: BookSnapshot) {
  const ls = levels(b, side);
  let level = 0, ahead = 0;
  for (const l of ls) {
    if (cents(l.price) === cents(price)) level += l.amount;
    else if (better(side, l.price, price)) ahead += l.amount;
  }
  return { best: ls[0]?.price ?? null, level, better: ahead };
}

/** Start following an order you just placed (your units are assumed to be the last ones at your price). */
export function trackOrder(o: { id: string; item: string; name: string; side: OrderSide; price: number; amount: number; decisionId?: string }, b: BookSnapshot): TrackedOrder {
  const l = look(o.side, o.price, b);
  const best = l.best;
  const status: TrackedStatus = best == null || !better(o.side, best, o.price) ? "top" : "behind";
  const seen = l.level >= o.amount;
  return { ...o, createdAt: b.ts, ahead: seen ? l.level - o.amount : 0, filled: 0, confirmed: false, seen, status, best, level: l.level, better: l.better,
    buyWeek: b.buyWeek, sellWeek: b.sellWeek, updatedAt: b.ts };
}

/** One new snapshot: queue position, fills and status. Returns the events worth telling you about. */
export function updateOrder(o: TrackedOrder, b: BookSnapshot): { order: TrackedOrder; events: OrderEvent[] } {
  if (o.status === "filled" || b.ts <= o.updatedAt) return { order: o, events: [] };
  const l = look(o.side, o.price, b);
  const events: OrderEvent[] = [];
  let { ahead, filled } = o;
  // real trades since the last update: instant sells fill buy orders, instant buys fill sell offers, best price first
  const rise = o.side === "buy" ? (o.sellWeek != null ? b.sellWeek - o.sellWeek : -1) : (o.buyWeek != null ? b.buyWeek - o.buyWeek : -1);
  const fallBuy = o.buyWeek != null && b.buyWeek < o.buyWeek, fallSell = o.sellWeek != null && b.sellWeek < o.sellWeek;
  const trades = rise >= 0 && !fallBuy && !fallSell ? rise : 0; // a counter fell (expiry batch): trades unknown this time
  const reachedUs = Math.max(0, trades - o.better); // better-priced units fill first
  const shrink = Math.max(0, o.level - l.level);
  const consumed = Math.max(shrink, reachedUs);
  const seen = o.seen || l.level >= o.amount - o.filled;
  if (!o.seen && seen) ahead = Math.max(0, l.level - (o.amount - o.filled)); // first time we see it: everything before it is ahead
  else if (o.seen) {
    ahead -= consumed;
    if (ahead < 0) { filled += -ahead; ahead = 0; }
    // your remaining units are still in the level: it cannot hold fewer units than you still have
    filled = Math.max(filled, o.amount - l.level);
  }
  filled = Math.min(o.amount, Math.max(0, filled));
  let status: TrackedStatus, confirmed = false;
  if (seen && (l.best == null || (better(o.side, o.price, l.best) && l.level === 0))) {
    // the best price moved strictly past yours and your price level is gone: used up
    status = "filled"; filled = o.amount; confirmed = true;
  } else if (filled >= o.amount) status = "filled";
  else status = l.best != null && better(o.side, l.best, o.price) ? "behind" : "top";
  const next: TrackedOrder = { ...o, ahead, filled, confirmed, seen, status, best: l.best, level: l.level, better: l.better, buyWeek: b.buyWeek, sellWeek: b.sellWeek, updatedAt: b.ts };
  if (status === "filled") events.push({ type: "filled", order: next, confirmed });
  else {
    if (filled > o.filled) events.push({ type: "partial", order: next, filled: filled - o.filled });
    if (status === "behind" && o.status !== "behind" && l.best != null)
      events.push({ type: "outbid", order: next, by: Math.abs(l.best - o.price), relist: Math.round((o.side === "buy" ? l.best + 0.1 : l.best - 0.1) * 10) / 10 });
    if (status === "top" && o.status === "behind") events.push({ type: "top", order: next });
  }
  return { order: next, events };
}
