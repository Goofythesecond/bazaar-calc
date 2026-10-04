// A recipe as the calculators use it: crafting table, Forge or NPC shop, with its unlock requirements.
// Parsed from NotEnoughUpdates-REPO by neu.ts.
import type { Requirement } from "../rules/index.js";

export interface Recipe {
  outputId: string;
  kind: "crafting" | "forge" | "npc" | "kat"; // npc: bought from an NPC shop for coins (inputs = [{ id: "SKYBLOCK_COIN", qty: coins }]);
                                              // kat: Kat raises a pet one rarity (inputs: the pet, items, SKYBLOCK_COIN; durationS)
  source?: string;                    // npc: who sells it
  inputs: { id: string; qty: number }[];
  outputCount: number;
  durationS?: number | null;
  requirements: Requirement[];
}
