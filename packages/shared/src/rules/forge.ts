// Forge rules. Source: wiki "The Forge" (CC BY-NC-SA 3.0) and NEU constants/hotmlayout.json (MIT).

export const FORGE = {
  minHotm: 2,
  slotsAtMinHotm: 2,
  maxSlotTier: 7, // +1 slot per HotM tier up to tier 7
  coleMoltenForgeReduction: 0.25,
  quickForgeMaxLevel: 20,
} as const;

export const FORGE_SOURCES = {
  rules: "https://hypixelskyblock.minecraft.wiki/w/The_Forge (CC BY-NC-SA 3.0)",
  quickForge: "NotEnoughUpdates-REPO constants/hotmlayout.json quick_forge.stat (MIT)",
};

/** Forge slots available at a HotM tier (0 below HotM 2). */
export function forgeSlots(hotmTier: number): number {
  if (hotmTier < FORGE.minHotm) return 0;
  return Math.min(FORGE.maxSlotTier, Math.floor(hotmTier));
}

/** Quick Forge time reduction: 10 + 0.5 x level % for levels 1-19, 30 % at level 20. */
export function quickForgeReduction(level: number): number {
  const l = Math.max(0, Math.min(FORGE.quickForgeMaxLevel, Math.floor(level)));
  if (l === 0) return 0;
  return l < 20 ? (10 + 0.5 * l) / 100 : 0.3;
}

/** Forge duration after reductions (they stack additively). */
export function forgeDurationSeconds(baseSeconds: number, opts: { quickForgeLevel: number; coleMoltenForge: boolean }): number {
  const reduction = quickForgeReduction(opts.quickForgeLevel) + (opts.coleMoltenForge ? FORGE.coleMoltenForgeReduction : 0);
  return baseSeconds * Math.max(0, 1 - reduction);
}
