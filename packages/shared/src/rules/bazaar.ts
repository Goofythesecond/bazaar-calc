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
  // NPC shops (not the bazaar): most sell at most 640 of an item per player per day, reset 00:00 UTC
  // (6,400 with Diaz's Shopping Spree perk). Source: hypixelskyblock.minecraft.wiki/w/Shops
  npcDailyBuyLimit: 640,
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

export function taxRate(flipperLevel: number): number {
  const lvl = Math.max(0, Math.min(BAZAAR.maxFlipperLevel, Math.floor(flipperLevel)));
  return BAZAAR.baseTax - lvl * BAZAAR.taxReductionPerFlipperLevel;
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
