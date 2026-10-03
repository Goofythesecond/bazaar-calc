// Enchanted-book combining rules, generated from hypixelskyblock.minecraft.wiki (CC BY-NC-SA 3.0) by
// research/wiki_enchants2.py. combine_status:
//   "combinable" - the wiki states the anvil cap ("can be combined ... up to X N") or lists the anvil recipes
//   "no_combine" - the wiki marks the enchant as not combinable
//   "unknown"    - no statement found: never used for book flips
import data from "./enchants.json" with { type: "json" };

export interface EnchantRule {
  id: string;                     // e.g. ENCHANTMENT_SHARPNESS (bazaar books are `${id}_${level}`)
  name: string;
  page: string;
  url: string;
  max_level: number | null;
  combine_cap: number | null;     // highest level that can be MADE by combining two books of the level below
  combine_status: "combinable" | "no_combine" | "unknown";
  combine_xp_cost: Record<string, number>; // XP levels to combine at a given input level (usually free)
  apply_xp_cost: number[];        // XP levels to apply level i+1 to an item
  enchanting_req: number | null;  // Enchanting skill needed to apply
  ultimate: boolean;
  bazaar_levels: number[];        // levels seen on the bazaar when the rules were generated
}

const RULES = (data as unknown as { rules: Record<string, EnchantRule> }).rules;

export const ENCHANT_SOURCE =
  "Enchantment data from hypixelskyblock.minecraft.wiki (CC BY-NC-SA 3.0), combining caps read from each enchantment page.";

export function enchantRules(): Record<string, EnchantRule> {
  return RULES;
}

const BOOK_RE = /^(ENCHANTMENT_[A-Z0-9_]+?)_(\d+)$/;

/** ENCHANTMENT_SHARPNESS_6 -> { enchant: "ENCHANTMENT_SHARPNESS", level: 6 } */
export function parseBookId(id: string): { enchant: string; level: number } | null {
  const m = BOOK_RE.exec(id);
  return m ? { enchant: m[1]!, level: Number(m[2]) } : null;
}

export function bookId(enchant: string, level: number): string {
  return `${enchant}_${level}`;
}

/** Can a level-`level` book be produced by combining two level-(level-1) books? */
export function canCombineInto(rule: EnchantRule, level: number): boolean {
  return rule.combine_status === "combinable" && rule.combine_cap != null && level >= 2 && level <= rule.combine_cap;
}

/** XP levels needed to combine two books of `inputLevel` (0 when combining is free). */
export function combineXpCost(rule: EnchantRule, inputLevel: number): number {
  return rule.combine_xp_cost[String(inputLevel)] ?? 0;
}

/** Number of level-`from` books needed to make one level-`to` book, or null if impossible. */
export function booksNeeded(rule: EnchantRule, from: number, to: number): number | null {
  if (to <= from) return null;
  for (let l = from + 1; l <= to; l++) if (!canCombineInto(rule, l)) return null;
  return 2 ** (to - from);
}
