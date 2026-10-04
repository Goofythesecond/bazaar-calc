// Tests: time-on-top episodes from consecutive order books, and order sizing / fill rates from them.
import { describe, expect, it } from "vitest";
import { TopTracker, quotaTime, summarizeTop, survival } from "./toptrack.js";
import { curve, fillModel, simulate, sizeFor } from "./sizing.js";

const L = (price: number, amount: number, orders = 1) => ({ price, amount, orders });

describe("top-of-book episodes", () => {
  it("follows a fresh best bid until it is outbid and counts what traded against it", () => {
    const t = new TopTracker();
    const asks = [L(20, 100)];
    expect(t.step("X", 0, [L(10, 50)], asks)).toEqual([]);
    expect(t.step("X", 60_000, [L(10.1, 100), L(10, 50)], asks)).toEqual([]);   // fresh post one tick better
    expect(t.step("X", 120_000, [L(10.1, 60), L(10, 50)], asks)).toEqual([]);   // 40 sold into it
    expect(t.step("X", 180_000, [L(10.1, 20), L(10, 50)], asks)).toEqual([]);   // 40 more
    const [e] = t.step("X", 240_000, [L(10.2, 5), L(10.1, 20), L(10, 50)], asks); // beaten
    expect(e).toMatchObject({ side: "bid", price: 10.1, polls: 3, flow: 80, end: "outbid", startAmount: 100, loS: 120, hiS: 240, active: 2 }); // trades in 2 of its 3 polls
    expect(e!.durS).toBe(180);
  });

  it("counts flow that swept past an emptied level, and cuts episodes at gaps", () => {
    const t = new TopTracker();
    t.step("X", 0, [L(10, 10)], []);
    t.step("X", 60_000, [L(10.1, 30), L(10, 10)], []);
    const [e] = t.step("X", 120_000, [L(9.9, 5)], []); // 30 at 10.1 and 10 at 10 consumed
    expect(e).toMatchObject({ end: "gone", flow: 40 });
    t.step("X", 180_000, [L(10, 5), L(9.9, 5)], []);
    const cut = t.step("X", 900_000, [L(10, 5)], []); // 12 min gap
    expect(cut[0]?.end).toBe("cut");
  });

  it("Kaplan-Meier treats cut episodes as censored", () => {
    const km = survival([{ durS: 60, end: "outbid" }, { durS: 120, end: "cut" }, { durS: 180, end: "outbid" }]);
    expect(km.at(-1)!.s).toBeCloseTo(0, 6);
    expect(km[1]!.s).toBeCloseTo(2 / 3, 6);
  });
});

describe("burstiness and thin data", () => {
  it("summarises the share of polls on top that saw trades (episodes of 3+ polls)", () => {
    const ep = (polls: number, active: number) => ({ side: "bid" as const, price: 1, startTs: 0, endTs: 0, durS: polls * 20, loS: 0, hiS: 0, polls, flow: 10, removedAtPrice: 0, startAmount: 0, startOrders: 0, end: "outbid" as const, active });
    expect(summarizeTop(Array.from({ length: 10 }, () => ep(4, 1)), 1)!.activeShare).toBeCloseTo(0.25, 6);
    expect(summarizeTop(Array.from({ length: 10 }, () => ep(2, 2)), 1)!.activeShare).toBeNull(); // short episodes say little
    expect(summarizeTop(Array.from({ length: 10 }, () => ({ ...ep(4, 1), active: undefined })), 1)!.activeShare).toBeNull(); // older data
  });
  it("with too few episodes, an item seldom beaten is modelled as holding the top long (its own beaten rate)", () => {
    // 4 episodes in 10 watched hours, all outbid: beaten 0.4 times an hour -> mean hold 2.5 h
    const stats = summarizeTop(Array.from({ length: 4 }, (_, i) => ({ side: "bid" as const, price: 1, startTs: i, endTs: i + 1, durS: 600, loS: 0, hiS: 0, polls: 30, flow: 5, removedAtPrice: 0, startAmount: 0, startOrders: 0, end: "outbid" as const })), 10)!;
    const m = fillModel(stats, 100, null, 5, 0.5);
    expect(m.basis).toBe("estimated");
    const mean = m.samples.reduce((a, [t]) => a + t, 0) / m.samples.length;
    expect(mean / 3600).toBeGreaterThan(2); expect(mean / 3600).toBeLessThan(3);
  });
});

describe("order sizing", () => {
  it("a big order fills at the flow rate while on top; a small one waits for your next look", () => {
    const s: [number, number][] = [[600, 600]];
    expect(simulate(s, 1000, 300)).toMatchObject({ unitsH: 3600, ordersH: 6 });
    expect(simulate(s, 100, 300).unitsH).toBeCloseTo(1200, 6);
  });

  it("picks the smallest order that still delivers the rate, never above the cap", () => {
    const m = fillModel(null, 3600, 6, 5, 0.5);
    const c = curve(m, 5);
    const need = c.at(-1)!.unitsH / 2;
    const p = sizeFor(c, need, 71_680);
    expect(p.unitsH).toBeGreaterThanOrEqual(need * 0.999);
    expect(sizeFor(c, 1e12, 500).qty).toBeLessThanOrEqual(500);
    for (let i = 1; i < c.length; i++) expect(c[i]!.unitsH).toBeGreaterThanOrEqual(c[i - 1]!.unitsH - 1e-9);
  });

  it("scales measured samples to the calculator's flow", () => {
    const stats = summarizeTop(Array.from({ length: 20 }, (_, i) => ({ side: "bid" as const, price: 1, startTs: i, endTs: i + 1, durS: 60 + i, loS: 0, hiS: 0, polls: 1, flow: 10, removedAtPrice: 10, startAmount: 1, startOrders: 1, end: "outbid" as const })), 1)!;
    const m = fillModel(stats, 7200, null, 5, 0.5);
    const rate = m.samples.reduce((a, [, f]) => a + f, 0) / m.samples.reduce((a, [t]) => a + t, 0);
    expect(m.basis).toBe("measured");
    expect(rate * 3600).toBeCloseTo(7200, 6);
  });

  it("quota time grows with the quota", () => {
    const eps = Array.from({ length: 30 }, (_, i) => ({ side: "bid" as const, price: 1, startTs: 0, endTs: 0, durS: 30 + 10 * i, loS: 0, hiS: 0, polls: 1, flow: 5 + i, removedAtPrice: 0, startAmount: 1, startOrders: 1, end: "outbid" as const }));
    const a = quotaTime(eps, 100, 5)!, b = quotaTime(eps, 1000, 5)!;
    expect(b.p50).toBeGreaterThan(a.p50);
    expect(a.p10).toBeLessThanOrEqual(a.p90);
  });

  it("one order never fills more than the whole market trades", () => {
    const m = fillModel(null, 3600, 6, 5, 0.5);
    for (const p of curve(m, 5)) expect(p.unitsH).toBeLessThanOrEqual(m.flowH + 1e-9);
  });
});
