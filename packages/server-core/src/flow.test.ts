import { describe, expect, it } from "vitest";
import { bookFlow } from "./ingest/bazaar.js";
import { competition } from "./stats.js";

describe("order-book flow measurement", () => {
  it("counts units removed at or above the new best bid / at or below the new best ask", () => {
    const prevBids = [{ price: 10, amount: 100, orders: 1 }, { price: 9.9, amount: 50, orders: 1 }];
    const prevAsks = [{ price: 11, amount: 40, orders: 1 }, { price: 11.1, amount: 60, orders: 2 }];
    // 70 of the 10.0 buy order filled; the 11.0 sell offer fully bought; someone undercut at 10.9
    const f = bookFlow(prevBids, prevAsks, [{ pricePerUnit: 10, amount: 30, orders: 1 }, { pricePerUnit: 9.9, amount: 50, orders: 1 }],
      [{ pricePerUnit: 10.9, amount: 5, orders: 1 }, { pricePerUnit: 11.1, amount: 60, orders: 2 }]);
    expect(f.bidRemoved).toBe(70);
    expect(f.askRemoved).toBe(0); // 11.0 > new best ask 10.9, so it is not counted as bought at the top
    expect(f.undercut).toBe(true);
    expect(f.outbid).toBe(false);
  });
  it("Poisson-corrects saturated undercut counts", () => {
    // 60 one-minute intervals, best price changed in 44 of them (73%): naive 44/h, corrected ~78/h
    const c = competition({ n: 60, secs: 3600, ob: 44, uc: 0, br: 6000, ar: 0 });
    expect(c.undercutBuyH!).toBeGreaterThan(75);
    expect(c.undercutBuyH!).toBeLessThan(82);
    expect(c.undercutSellH).toBe(0);
    expect(c.observedBuyFlowH).toBe(6000);
  });
  it("needs at least 15 intervals", () => {
    expect(competition({ n: 5, secs: 300, ob: 1, uc: 1, br: 1, ar: 1 }).undercutBuyH).toBeNull();
  });
});
