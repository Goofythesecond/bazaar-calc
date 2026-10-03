// Bazaar rules. Sources: research/RESEARCH.md (wiki "Bazaar", SkyHanni + Bazaar Utils source for the daily limit).

export const BAZAAR = {
  baseOrderSlots: 14,
  slotsPerFlipperLevel: 7,
  maxFlipperLevel: 2,
  baseTax: 0.0125,
  taxReductionPerFlipperLevel: 0.00125,
  maxUnitsPerOrder: 71_680,
  maxUnitsPerOrderUnstackable: 256,
  maxInstantBuyUnits: 2_240, // most items (inventory limit)
  maxSellOfferValue: 1_000_000_000,
  instantBuyQuoteMarkup: 0.04,
  orderExpiryDays: 7,
  priceTick: 0.1,
  maxCustomPricePerUnit: 500_000_000,
  // community-derived (SkyHanni constants/Bazaar.json, Bazaar Utils): user setting
  dailyLimitDefault: 15_000_000_000,
  dailyLimitPerActionCap: 2_147_483_647,
  dailyLimitResetUtcHour: 0,
  // NPC shops (not the bazaar): most sell at most 640 of an item per profile per day per merchant, reset 00:00 UTC;
  // 6,400 while Diaz's "Shopping Spree" perk is active. Source: hypixelskyblock.minecraft.wiki/w/Shop (checked 2026-10-03)
  npcDailyBuyLimit: 640,
  npcDailyBuyLimitShoppingSpree: 6_400,
  // selling TO NPC shops pays no bazaar tax but earns at most 500,000,000 coins per profile per day (00:00 UTC), since
  // 2025-10-15 (200M before). Source: hypixelskyblock.minecraft.wiki/w/Shop (checked 2026-10-03)
  npcDailySellCoins: 500_000_000,
  // Derpy's "QUAD TAXES!!!": "Pay 4x the normal amount of taxes!", bazaar tax included since 2024-07-02.
  // Source: hypixelskyblock.minecraft.wiki/w/Derpy (checked 2026-10-03); Bazaar Utils applies the same x4.
  quadTaxesMultiplier: 4,
} as const;

export const BAZAAR_SOURCES = {
  rules: "https://hypixelskyblock.minecraft.wiki/w/Bazaar (CC BY-NC-SA 3.0)",
  dailyLimit:
    "Community-derived: SkyHanni BazaarLimitTracker + constants/Bazaar.json, Bazaar Utils BazaarLimitsVisualizer. Not confirmed by Hypixel.",
};

export function orderSlots(flipperLevel: number): number {
  const lvl = Math.max(0, Math.min(BAZAAR.maxFlipperLevel, Math.floor(flipperLevel)));
  return BAZAAR.baseOrderSlots + lvl * BAZAAR.slotsPerFlipperLevel;
}

/** Tax on bazaar sales: 1.25% minus 0.125% per Bazaar Flipper level, times 4 while Derpy's QUAD TAXES!!! is active. */
export function taxRate(flipperLevel: number, quadTaxes = false): number {
  const lvl = Math.max(0, Math.min(BAZAAR.maxFlipperLevel, Math.floor(flipperLevel)));
  return (BAZAAR.baseTax - lvl * BAZAAR.taxReductionPerFlipperLevel) * (quadTaxes ? BAZAAR.quadTaxesMultiplier : 1);
}

/** Units of one item an NPC merchant sells you per day (Diaz's Shopping Spree: x10). */
export function npcBuyLimit(shoppingSpree = false): number {
  return shoppingSpree ? BAZAAR.npcDailyBuyLimitShoppingSpree : BAZAAR.npcDailyBuyLimit;
}

/** Coins one action adds to the daily limit (each action is capped at the 32-bit integer limit). */
export function limitContribution(coins: number): number {
  return Math.min(Math.max(0, coins), BAZAAR.dailyLimitPerActionCap);
}

/** Milliseconds until the next daily-limit reset (00:00 UTC). */
export function msUntilLimitReset(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, BAZAAR.dailyLimitResetUtcHour);
  return next - now;
}
