// Tests: fill-speed calibration from paper trades (per-side time ratios, pulled toward the model when trades are few).
import { describe, expect, it } from "vitest";
import { NO_CALIBRATION, calibrate, fillFactor } from "./calibration.js";
import type { PaperTrade } from "./paper.js";

const H = 3.6e6;
const trade = (item: string, buyX: number, sellX: number, i = 0): PaperTrade => ({
  id: `${item}-${i}`, key: `bazaar:${item}`, title: item, item, qty: 10, openedAt: 0, closedAt: (buyX + sellX) * H, phase: "done", price: 1, onTop: true,
  nextLook: 0, bought: 10, sold: 10, cost: 0, revenue: 0, relists: 0, expected: { profit: 1, hours: 2, buyH: 1, sellH: 1 }, boughtAt: buyX * H, realized: 1,
});

describe("fill calibration", () => {
  it("is neutral without trades that recorded per-side predictions", () => {
    expect(calibrate([])).toEqual(NO_CALIBRATION);
    const old = { ...trade("X", 3, 3), expected: { profit: 1, hours: 1 } };
    expect(calibrate([old])).toEqual(NO_CALIBRATION);
  });
  it("measures each side as a geometric mean, pulled toward the model by 5 pseudo-trades", () => {
    const ts = Array.from({ length: 5 }, (_, i) => trade("X", 2, 4, i)); // buys took 2x, sales 4x the prediction
    const c = calibrate(ts);
    expect(c.buy.factor).toBeCloseTo(Math.sqrt(2), 6);  // exp(5 ln 2 / (5 + 5))
    expect(c.sell.factor).toBeCloseTo(2, 6);            // exp(5 ln 4 / 10)
    expect(c.trades).toBe(5);
  });
  it("gives an item with its own trades its own factor, pulled toward the side's", () => {
    const ts = [...Array.from({ length: 10 }, (_, i) => trade("A", 1, 1, i)), trade("B", 8, 1)];
    const c = calibrate(ts);
    expect(fillFactor(c, "B", "buy")).toBeGreaterThan(fillFactor(c, "A", "buy"));
    expect(fillFactor(c, "UNSEEN", "buy")).toBe(c.buy.factor);
    expect(fillFactor(undefined, "B", "buy")).toBe(1);
  });
});
