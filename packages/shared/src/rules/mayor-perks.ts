// Mayor and minister perks that change the calculator's rules, recognised by name in Hypixel's election data:
//   Cole "Molten Forge"        forge times -25%           (wiki "Cole")
//   Derpy "QUAD TAXES!!!"      bazaar tax x4              (wiki "Derpy", checked 2026-10-03)
//   Diaz "Shopping Spree"      NPC buy limits x10 (6,400) (wiki "Diaz" / "Shop", checked 2026-10-03)
// A perk counts when the current mayor has it or the current minister's one perk is it.

export interface PerkEffects { coleMoltenForge: boolean; quadTaxes: boolean; shoppingSpree: boolean }
export const NO_PERKS: PerkEffects = { coleMoltenForge: false, quadTaxes: false, shoppingSpree: false };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Effects of one mayor term (perks of the mayor plus the minister's perk). */
export function perkEffects(term?: { perks: string[]; minister?: { perk: string | null } | null } | null): PerkEffects {
  const names = new Set([...(term?.perks ?? []), term?.minister?.perk ?? ""].map(norm));
  return { coleMoltenForge: names.has("moltenforge"), quadTaxes: names.has("quadtaxes"), shoppingSpree: names.has("shoppingspree") };
}

/** The term running at `now`, if known. */
export function currentTerm<T extends { start: number; end: number }>(terms: T[], now = Date.now()): T | undefined {
  return terms.find(t => t.start <= now && t.end > now);
}

/** Plain-language list of the active effects (shown on the flip pages). */
export function describePerks(e: PerkEffects): string[] {
  return [
    e.coleMoltenForge ? "Cole's Molten Forge: forge times 25% shorter" : "",
    e.quadTaxes ? "Derpy's QUAD TAXES!!!: bazaar tax is 4x (5% before Bazaar Flipper)" : "",
    e.shoppingSpree ? "Diaz's Shopping Spree: NPC shops sell up to 6,400 of an item a day" : "",
  ].filter(Boolean);
}
