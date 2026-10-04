// "Track this route": saves the decision with what the calculator predicted (the journal on Track record) and adds the
// route's buy orders to My orders at the suggested prices and sizes. The sell offer is added when the buy side has
// filled (from My orders), at the best price then: that is when you place it in game.
import { type Opportunity, type RankedOpportunity, type TrackedOrder, trackOrder } from "@bc/shared";
import { api } from "./lib";
import { type Decision, journal, trackedOrders } from "./prefs";

type Book = Parameters<typeof trackOrder>[1] & { name: string };

export async function trackRoute(o: Opportunity & Partial<Pick<RankedOpportunity, "confidence">>): Promise<{ orders: number }> {
  const id = `${Date.now()}`;
  const legs = o.orderPlan.filter(l => l.side === "buy");
  const books = legs.length ? (await api<{ items: Record<string, Book> }>(`/api/v1/books?ids=${encodeURIComponent([...new Set(legs.map(l => l.item))].join(","))}`)).items : {};
  const orders: TrackedOrder[] = legs.flatMap(l => (books[l.item] ? Array.from({ length: Math.max(1, l.parallel) }, (_, i) =>
    trackOrder({ id: `${id}-${l.item}-${i}`, item: l.item, name: l.name, side: "buy", price: Math.round(l.price * 10) / 10, amount: Math.round(l.qty), decisionId: id }, books[l.item]!)) : []));
  const d: Decision = {
    id, at: Date.now(), key: o.key, title: o.title, kind: o.kind,
    predicted: { profitPerUnit: o.profitPerUnit, coinsH: o.coinsH, unitsH: o.unitsH, batch: o.batch, capitalUsed: o.capitalUsed, marginPct: o.marginPct,
      confidence: o.confidence ?? { score: 1, level: "high", reasons: [] },
      buys: o.buys.map(b => ({ item: b.item, name: b.name, mode: b.mode, price: b.price, qty: b.qty })),
      sell: { item: o.sell.item, name: o.sell.name, mode: o.sell.mode, price: o.sell.grossPrice },
      hoursForBatch: o.unitsH > 0 ? o.batch / o.unitsH : null },
    orderIds: orders.map(x => x.id),
  };
  trackedOrders.set(all => [...all, ...orders]);
  journal.set(all => [...all, d]);
  return { orders: orders.length };
}

/** After a tracked buy order filled: track the sell offer for those units at 0.1 below the best offer now. */
export async function trackSellAfterBuy(buy: TrackedOrder): Promise<void> {
  const b = (await api<{ items: Record<string, Book> }>(`/api/v1/books?ids=${encodeURIComponent(buy.item)}`)).items[buy.item];
  if (!b || !b.asks[0]) throw new Error(`${buy.name} has no sell offers to price against right now`);
  const price = Math.round((b.asks[0].price - 0.1) * 10) / 10;
  // you sell what you bought: the filled units (or what you claimed of them, when you said)
  const sell = trackOrder({ id: `${buy.id}-sell`, item: buy.item, name: buy.name, side: "sell", price, amount: buy.claimed || buy.filled, decisionId: buy.decisionId }, b);
  trackedOrders.set(all => [...all, sell]);
  if (buy.decisionId) journal.set(all => all.map(d => (d.id === buy.decisionId ? { ...d, orderIds: [...d.orderIds, sell.id] } : d)));
}
