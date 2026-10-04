// Tests: Auction House BIN fees (creation fee brackets, claim tax with its 1M floor, Derpy's x4 on the claim tax only).
import { describe, expect, it } from "vitest";
import { ahBinNet } from "./auction-house.js";

describe("Auction House BIN fees", () => {
  it("takes the creation fee by bracket and the 1% claim tax above 1M", () => {
    expect(ahBinNet(500_000)).toBeCloseTo(495_000, 6);                     // 1% creation, no claim tax
    expect(ahBinNet(5_000_000)).toBeCloseTo(5_000_000 - 50_000 - 50_000, 6); // 1% + 1%
    expect(ahBinNet(50_000_000)).toBeCloseTo(50_000_000 - 1_000_000 - 500_000, 6); // 2% + 1%
    expect(ahBinNet(200_000_000)).toBeCloseTo(200_000_000 - 5_000_000 - 2_000_000, 6); // 2.5% + 1%
  });
  it("never lets the claim tax take the payout below 1M, and quadruples only the claim tax under Derpy", () => {
    expect(ahBinNet(1_005_000)).toBeCloseTo(1_005_000 - 10_050 - 5_000, 6); // claim tax capped at price - 1M
    expect(ahBinNet(5_000_000, true)).toBeCloseTo(5_000_000 - 50_000 - 200_000, 6); // 1% creation + 4% claim
  });
});
