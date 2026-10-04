// Tests: paper trading replays a picked flip on snapshots: buys from real instant sells while on top, relists when
// beaten, sells the same way, reports realized vs expected profit.
import { describe, expect, it } from "vitest";
import { type ItemMarket, findDips, newPaperState, paperStep, paperSummary } from "../index.js";

const mk = (bid: number, ask: number, ibuyWeek: number, isellWeek: number, extra: Partial<ItemMarket> = {}): Map<string, ItemMarket> => new Map([["X", {
  id: "X", name: "X", ts: 0, ask, bid, askVolume: 0, bidVolume: 0, askOrders: 0, bidOrders: 0, ibuyWeek, isellWeek, undercutBuyH: null, undercutSellH: null,
  liveHours: 0, flags: [], flagWhy: {}, ...extra }]]);
const pick = () => [{ key: "bazaar:X", title: "X", item: "X", qty: 100, profitPerUnit: 8, unitsH: 50, kind: "bazaar" }];
const o = { checkMin: 5, flipperLevel: 2 };

describe("paper trading", () => {
  it("buys from instant sells, then sells to instant buys, and books the realized profit after tax", () => {
    let st = paperStep(newPaperState(), 1_000, mk(10, 20, 1000, 1000), pick, o);
    expect(st.trades).toHaveLength(1); expect(st.trades[0]).toMatchObject({ phase: "buying", price: 10.1 });
    st = paperStep(st, 21_000, mk(10, 20, 1000, 1060), pick, o);   // 60 instant-sold
    expect(st.trades[0]!.bought).toBe(60);
    st = paperStep(st, 41_000, mk(10, 20, 1000, 1110), pick, o);   // 50 more: 40 needed -> bought out, sell offer at 19.9
    expect(st.trades[0]).toMatchObject({ phase: "selling", bought: 100, price: 19.9 });
    st = paperStep(st, 61_000, mk(10, 20, 1100, 1110), pick, o);   // 100 instant-bought
    const t = st.trades[0]!;
    expect(t.phase).toBe("done");
    expect(t.realized).toBeCloseTo(100 * 19.9 * 0.99 - 100 * 10.1, 6);
    const s = paperSummary(st);
    expect(s.closed).toBe(1); expect(s.capture).toBeCloseTo(t.realized! / 800, 6); expect(s.winRate).toBe(1);
  });
  it("opens a trade as soon as picks arrive (no picks yet does not use up the 5-minute turn)", () => {
    let st = paperStep(newPaperState(), 1_000, mk(10, 20, 1000, 1000), () => [], o);
    expect(st.trades).toHaveLength(0); expect(st.lastPick).toBe(0);
    st = paperStep(st, 21_000, mk(10, 20, 1000, 1000), pick, o);
    expect(st.trades).toHaveLength(1);
  });
  it("stops filling when beaten and relists at the next look", () => {
    let st = paperStep(newPaperState(), 1_000, mk(10, 20, 1000, 1000), pick, o);
    st = paperStep(st, 21_000, mk(10.2, 20, 1000, 1050), pick, o); // someone posted 10.2 > our 10.1
    expect(st.trades[0]).toMatchObject({ onTop: false, bought: 0 });
    st = paperStep(st, 301_000, mk(10.2, 20, 1000, 1050), pick, o); // next look: relist at 10.3
    expect(st.trades[0]).toMatchObject({ onTop: true, price: 10.3, relists: 1 });
  });
});

describe("dips", () => {
  it("finds a sell offer well below its typical price and prices the recovery after tax", () => {
    const m = mk(80, 70, 7000, 7000, { topAsk: [{ price: 70, amount: 30, orders: 1 }, { price: 99, amount: 50, orders: 1 }],
      ref: { askMed: 100, bidMed: 90, spreadMed: 0.1, days: 14, ask24: 100, bid24: 90, n24: 24, ask7: 100, bid7: 90, n7: 100 } });
    const [d] = findDips(m, { minDrop: 0.1, flipperLevel: 0 });
    expect(d).toMatchObject({ id: "X", cheapUnits: 30 });
    expect(d!.drop).toBeCloseTo(0.3);
    expect(d!.profitOffer).toBeCloseTo(99.9 * 0.9875 - 70);
    expect(d!.potential).toBeCloseTo(d!.profitOffer * 30);
    expect(findDips(m, { minDrop: 0.4 })).toHaveLength(0);
  });
  it("measures against the lower of the 24 h and 7-day medians (a price back to normal after a spike is not a dip)", () => {
    const m = mk(141_618, 179_988, 16_485, 1191, { topAsk: [{ price: 179_988, amount: 384, orders: 1 }],
      ref: { askMed: 190_000, bidMed: 140_000, spreadMed: 0.3, days: 14, ask24: 999_993, bid24: 140_000, n24: 21, ask7: 189_995, bid7: 140_000, n7: 34 } });
    expect(findDips(m, { minDrop: 0.1 })).toHaveLength(0);
    expect(findDips(m, { minDrop: 0.05 })[0]!.typicalAsk).toBe(189_995);
  });
  it("says whether a dip is new (at the typical level an hour ago) or lasting", () => {
    const ref = (ago: number | null) => ({ askMed: 100, bidMed: 80, spreadMed: 0.2, days: 14, ask24: 100, bid24: 80, n24: 24, ask7: 100, bid7: 80, n7: 100,
      hourAgo: ago == null ? null : { ask: ago, bid: 80 } });
    const at = (ago: number | null) => findDips(mk(65, 70, 7000, 7000, { topAsk: [{ price: 70, amount: 100, orders: 1 }], ref: ref(ago) }), { minDrop: 0.1 })[0]!.since;
    expect(at(99)).toBe("new");
    expect(at(85)).toBe("lasting");
    expect(at(null)).toBe("unknown");
  });
});
