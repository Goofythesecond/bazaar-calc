// Tests: following your own orders through order-book snapshots (queue position, fills, outbid, confirmed fills).
import { describe, expect, it } from "vitest";
import { ORDER_LIFETIME_MS, claimOrder, trackOrder, updateOrder } from "../index.js";

const book = (ts: number, bids: [number, number][], asks: [number, number][], sellWeek = 1000, buyWeek = 1000) =>
  ({ ts, bids: bids.map(([price, amount]) => ({ price, amount, orders: 1 })), asks: asks.map(([price, amount]) => ({ price, amount, orders: 1 })), buyWeek, sellWeek });

describe("order tracker", () => {
  it("queues behind what was there, fills from real trades, confirms when the best price moves past", () => {
    // you placed a buy order of 100 at 10.0; 300 units were already at 10.0
    let o = trackOrder({ id: "a", item: "X", name: "X", side: "buy", price: 10, amount: 100 }, book(0, [[10, 400], [9.9, 50]], [[11, 10]]));
    expect(o).toMatchObject({ status: "top", ahead: 300, seen: true, filled: 0 });
    // 250 instant-sold (counter rose 250): you move up, nothing filled yet
    let r = updateOrder(o, book(20_000, [[10, 150], [9.9, 50]], [[11, 10]], 1250));
    expect(r.order.ahead).toBe(50); expect(r.order.filled).toBe(0);
    // 120 more: 50 in front, 70 of yours
    r = updateOrder(r.order, book(40_000, [[10, 30], [9.9, 50]], [[11, 10]], 1370));
    expect(r.order.filled).toBe(70); expect(r.events.map(e => e.type)).toEqual(["partial"]);
    // someone outbids at 10.1: alert with the relist price
    r = updateOrder(r.order, book(60_000, [[10.1, 5], [10, 30]], [[11, 10]], 1370));
    expect(r.order.status).toBe("behind"); expect(r.events[0]).toMatchObject({ type: "outbid", relist: 10.2 });
    // the best buy order drops below yours and 10.0 is gone: filled, confirmed
    r = updateOrder(r.order, book(80_000, [[9.9, 50]], [[11, 10]], 1405));
    expect(r.order).toMatchObject({ status: "filled", filled: 100, confirmed: true }); expect(r.events[0]!.type).toBe("filled");
  });
  it("does not conclude anything before your order shows up in the book", () => {
    const o = trackOrder({ id: "b", item: "X", name: "X", side: "sell", price: 11, amount: 64 }, book(0, [[10, 5]], [[11.5, 10]]));
    expect(o.seen).toBe(false);
    const r = updateOrder(o, book(20_000, [[10, 5]], [[11.5, 10]]));
    expect(r.order.status).not.toBe("filled"); expect(r.order.filled).toBe(0);
    const r2 = updateOrder(r.order, book(40_000, [[10, 5]], [[11, 64], [11.5, 10]]));
    expect(r2.order).toMatchObject({ seen: true, ahead: 0, status: "top" });
  });
  it("an expiry batch (a counter falls) is not read as trades", () => {
    const o = trackOrder({ id: "c", item: "X", name: "X", side: "buy", price: 10, amount: 10 }, book(0, [[10, 110]], [[11, 1]]));
    const r = updateOrder(o, book(20_000, [[10, 110]], [[11, 1]], 900, 800));
    expect(r.order.filled).toBe(0); expect(r.order.ahead).toBe(100);
  });
  it("expires 7 days after it was added, keeps what filled, and records partial claims", () => {
    const o = trackOrder({ id: "e", item: "X", name: "X", side: "buy", price: 10, amount: 100 }, book(0, [[10, 100]], [[11, 10]]));
    let r = updateOrder(o, book(20_000, [[10, 60]], [[11, 10]], 1040));
    expect(r.order.filled).toBe(40);
    const c = claimOrder(r.order, 25);
    expect(c.claimed).toBe(25);
    const all = claimOrder(c);
    expect(all.claimed).toBe(40); // claim the rest of what filled
    r = updateOrder(all, book(ORDER_LIFETIME_MS + 1, [[10, 0]], [[11, 10]], 1200));
    expect(r.order).toMatchObject({ expired: true, filled: 40, claimed: 40 });
    expect(r.events.map(e => e.type)).toEqual(["expired"]);
    expect(updateOrder(r.order, book(ORDER_LIFETIME_MS + 60_000, [], [[11, 10]], 1300)).order).toBe(r.order); // no more fills
  });
});
