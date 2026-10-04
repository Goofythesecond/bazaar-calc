// Paper trading: the calculator's own top bazaar flip, run as virtual orders on the real market, to show how close real
// results come to its predictions (realized / expected profit, win rate, time taken). Same replay rules as the backtest
// (scripts/checks/backtest.mjs), which this was validated with:
//  - a virtual buy order goes 0.1 above the best buy order (a sell offer 0.1 below the best offer) and counts as on top
//    until someone shows a price at least as good (our order is not really in the book: a competitor aiming at the
//    visible best would have gone one tick past us)
//  - while on top it fills from real instant trades (Hypixel's counters); polls where an expiry batch made a counter
//    fall are skipped (the trades in them are unknown)
//  - beaten: relisted at the next look (every check interval) at the new best price
//  - bought out: the units go on a sell offer the same way; after `expireMs` anything unsold is valued at an instant
//    sell into the best buy order
// The record lives where it runs: the visitor's browser (static site) or the server (self-hosted, every poll).
import { taxRate } from "../rules/index.js";
import type { ItemMarket } from "../market/index.js";

export interface PaperCandidate { key: string; title: string; item: string; qty: number; profitPerUnit: number; unitsH: number; kind: string }

export interface PaperTrade {
  id: string; key: string; title: string; item: string; qty: number;
  openedAt: number; closedAt: number | null;
  phase: "buying" | "selling" | "done" | "expired";
  price: number;            // the current virtual order's price
  onTop: boolean; nextLook: number;
  bought: number; sold: number; cost: number; revenue: number; relists: number;
  expected: { profit: number; hours: number };
  realized: number | null;  // coins after tax, when closed
}

export interface PaperState { trades: PaperTrade[]; lastPick: number; counters: Record<string, [number, number]>; lastTs: number }
export const newPaperState = (): PaperState => ({ trades: [], lastPick: 0, counters: {}, lastTs: 0 });

export interface PaperSummary { closed: number; open: number; expected: number; realized: number; capture: number | null; winRate: number | null; avgHours: number | null; avgExpectedHours: number | null }

const PICK_EVERY = 5 * 60_000, EXPIRE = 6 * 3600_000, MAX_OPEN = 3;

/** One market snapshot: advance open trades, and every 5 minutes open the best candidate not already running. */
export function paperStep(st: PaperState, ts: number, market: Map<string, ItemMarket>, candidates: () => PaperCandidate[], o: { checkMin: number; flipperLevel: number; quadTaxes?: boolean }): PaperState {
  if (ts <= st.lastTs) return st;
  const tax = taxRate(o.flipperLevel, o.quadTaxes), check = Math.max(0.5, o.checkMin) * 60_000;
  const trades = st.trades.map(t => ({ ...t }));
  const counters: Record<string, [number, number]> = { ...st.counters };
  for (const t of trades) {
    if (t.phase === "done" || t.phase === "expired") continue;
    const m = market.get(t.item);
    if (!m || m.ask == null || m.bid == null) continue;
    const prev = counters[t.item];
    const sold = prev ? m.isellWeek - prev[1] : -1, bought = prev ? m.ibuyWeek - prev[0] : -1;
    const known = sold >= 0 && bought >= 0; // an expiry batch makes the counters fall: trades unknown
    if (t.phase === "buying") {
      if (t.onTop && m.bid >= t.price - 1e-9) t.onTop = false; // someone matched or beat our virtual bid
      if (t.onTop && known) { const take = Math.min(t.qty - t.bought, sold); t.bought += take; t.cost += take * t.price; }
      if (t.bought >= t.qty) { t.phase = "selling"; t.price = Math.round((m.ask - 0.1) * 10) / 10; t.onTop = true; t.nextLook = ts + check; }
      else if (!t.onTop && ts >= t.nextLook) { t.price = Math.round((m.bid + 0.1) * 10) / 10; t.onTop = true; t.relists++; t.nextLook = ts + check; }
    } else {
      if (t.onTop && m.ask <= t.price + 1e-9) t.onTop = false;
      if (t.onTop && known) { const take = Math.min(t.bought - t.sold, bought); t.sold += take; t.revenue += take * t.price; }
      if (t.sold >= t.bought) { t.phase = "done"; t.closedAt = ts; t.realized = t.revenue * (1 - tax) - t.cost; }
      else if (!t.onTop && ts >= t.nextLook) { t.price = Math.round((m.ask - 0.1) * 10) / 10; t.onTop = true; t.relists++; t.nextLook = ts + check; }
    }
    if ((t.phase === "buying" || t.phase === "selling") && ts - t.openedAt >= EXPIRE) {
      // unsold units are sold instantly into the best buy order; unfilled buying is simply cancelled
      const left = t.bought - t.sold;
      t.revenue += left * m.bid; t.sold = t.bought;
      t.phase = "expired"; t.closedAt = ts; t.realized = t.revenue * (1 - tax) - t.cost;
    }
  }
  for (const [id, m] of market) if (m.ask != null || m.bid != null) counters[id] = [m.ibuyWeek, m.isellWeek];
  let lastPick = st.lastPick;
  const open = trades.filter(t => t.phase === "buying" || t.phase === "selling");
  if ((!lastPick || ts - lastPick >= PICK_EVERY) && open.length < MAX_OPEN) {
    const busy = new Set(open.map(t => t.item)), list = candidates();
    // no picks yet (still loading, or none qualify): try again next snapshot instead of waiting 5 minutes
    if (list.length) lastPick = ts;
    const c = list.find(x => !busy.has(x.item) && x.qty > 0 && x.unitsH > 0 && x.profitPerUnit > 0);
    const m = c && market.get(c.item);
    if (c && m?.bid != null) trades.push({ id: `${ts}-${c.item}`, key: c.key, title: c.title, item: c.item, qty: c.qty, openedAt: ts, closedAt: null, phase: "buying",
      price: Math.round((m.bid + 0.1) * 10) / 10, onTop: true, nextLook: ts + check, bought: 0, sold: 0, cost: 0, revenue: 0, relists: 0,
      expected: { profit: c.profitPerUnit * c.qty, hours: c.qty / c.unitsH }, realized: null });
  }
  return { trades: trades.slice(-200), lastPick, counters, lastTs: ts };
}

export function paperSummary(st: PaperState): PaperSummary {
  const closed = st.trades.filter(t => t.realized != null);
  const expected = closed.reduce((a, t) => a + t.expected.profit, 0), realized = closed.reduce((a, t) => a + (t.realized ?? 0), 0);
  const hours = closed.map(t => ((t.closedAt ?? t.openedAt) - t.openedAt) / 3.6e6);
  return { closed: closed.length, open: st.trades.length - closed.length, expected, realized,
    capture: expected > 0 ? realized / expected : null, winRate: closed.length ? closed.filter(t => (t.realized ?? 0) > 0).length / closed.length : null,
    avgHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
    avgExpectedHours: closed.length ? closed.reduce((a, t) => a + t.expected.hours, 0) / closed.length : null };
}
