// Auction House fees on a BIN sale (hypixelskyblock.minecraft.wiki/w/Auction_House and /w/Derpy, checked 2026-10-04):
//  - creation fee for BIN listings: 1% of the price below 10,000,000 coins, 2% from 10M to 100M, 2.5% above 100M
//  - collection (claim) tax: 1% when collecting more than 1,000,000 coins, capped so the payout never drops below 1M;
//    Derpy's QUAD TAXES!!! quadruples it (not the creation fee)
// Not modelled: the duration fee (its amount is not given on the wiki page).

export const AH_FEES = {
  binCreation: [{ below: 10_000_000, rate: 0.01 }, { below: 100_000_000, rate: 0.02 }, { below: Infinity, rate: 0.025 }],
  claimTax: 0.01,
  claimTaxFloor: 1_000_000,
  quadTaxesMultiplier: 4,
} as const;

/** Coins you keep from selling one BIN at `price`: minus the creation fee and the claim tax. */
export function ahBinNet(price: number, quadTaxes = false): number {
  if (!(price > 0)) return 0;
  const creation = price * AH_FEES.binCreation.find(b => price < b.below)!.rate;
  const rate = AH_FEES.claimTax * (quadTaxes ? AH_FEES.quadTaxesMultiplier : 1);
  const claim = price > AH_FEES.claimTaxFloor ? Math.min(price * rate, price - AH_FEES.claimTaxFloor) : 0;
  return price - creation - claim;
}

/** The same as words, for the route's working: "1% listing fee + 1% claim tax". */
export function ahBinFeeText(price: number, quadTaxes = false): string {
  const c = AH_FEES.binCreation.find(b => price < b.below)!.rate * 100;
  const claim = price > AH_FEES.claimTaxFloor ? `${AH_FEES.claimTax * 100 * (quadTaxes ? AH_FEES.quadTaxesMultiplier : 1)}% claim tax (not below 1M)` : "no claim tax (1M or less)";
  return `${c}% listing fee + ${claim}`;
}
