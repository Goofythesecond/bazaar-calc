// Recipe / action requirements. Parsed from NEU `crafttext` ("Requires: Diamond IV", "Requires: Gemstone X & HotM 5",
// "Requires Coal IV"), `slayer_req` ("WOLF_6") and `reputation_req` ("BARBARIAN:7500").

export type Requirement =
  | { type: "collection"; name: string; tier: number; text: string }
  | { type: "hotm"; tier: number; text: string }
  | { type: "slayer"; name: string; level: number; text: string }
  | { type: "reputation"; faction: string; amount: number; text: string }
  | { type: "enchanting"; level: number; text: string }
  | { type: "skill"; name: string; level: number; text: string } // Taming for Kat, Foraging for Galatea (wiki)
  | { type: "xp_levels"; levels: number; text: string }
  | { type: "forge"; text: string }
  | { type: "unverified"; text: string };

export interface Profile {
  hotmTier: number;
  quickForgeLevel: number;
  enchantingLevel: number;
  collections: Record<string, number>;   // collection name (e.g. "Diamond") -> unlocked tier
  slayers: Record<string, number>;       // "Zombie" / "Wolf" / ... -> level
  skills: Record<string, number>;        // "Taming" / "Foraging" -> level
  reputation: Record<string, number>;    // "Barbarian" -> reputation
  xpLevels: number;
  coleMoltenForge: boolean;              // auto-set from the current mayor when known
  quadTaxes: boolean;                    // Derpy's QUAD TAXES!!! (bazaar tax x4): auto-set from the current mayor
  npcShoppingSpree: boolean;             // Diaz's Shopping Spree (NPC buy limits x10): auto-set from the current mayor
  ignoreRequirements: boolean;           // show everything regardless of unlocks
}

export const DEFAULT_PROFILE: Profile = {
  hotmTier: 0, quickForgeLevel: 0, enchantingLevel: 0, collections: {}, slayers: {}, skills: {}, reputation: {},
  xpLevels: 0, coleMoltenForge: false, quadTaxes: false, npcShoppingSpree: false, ignoreRequirements: true,
};

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
export function roman(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  if (!/^[IVXLC]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]!]!, next = ROMAN[s[i + 1] ?? ""] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

const SLAYER_NAMES: Record<string, string> = { ZOMBIE: "Zombie", SPIDER: "Spider", WOLF: "Wolf", EMAN: "Enderman", ENDERMAN: "Enderman", BLAZE: "Blaze", VAMPIRE: "Vampire" };

export function parseCraftText(text: string | null | undefined): Requirement[] {
  if (!text) return [];
  const body = text.replace(/^Requires:?\s*/i, "").trim();
  if (!body) return [];
  return body.split(/\s*&\s*|\s*,\s*/).filter(Boolean).map((part): Requirement => {
    let m = /^HotM\s+(\d+)$/i.exec(part);
    if (m) return { type: "hotm", tier: Number(m[1]), text: part };
    m = /^(.+?) Slayer\s+([IVXLC\d]+)$/.exec(part);
    if (m) return { type: "slayer", name: m[1]!, level: roman(m[2]!) ?? 0, text: part };
    m = /^(.+?)\s+([IVXLC]+|\d+)$/.exec(part);
    if (m && roman(m[2]!) != null) return { type: "collection", name: m[1]!, tier: roman(m[2]!)!, text: `${part} collection` };
    return { type: "unverified", text: part };
  });
}

export function parseSlayerReq(req: string | null | undefined): Requirement[] {
  if (!req) return [];
  const m = /^([A-Z]+)_(\d+)$/.exec(req);
  if (!m) return [{ type: "unverified", text: `slayer ${req}` }];
  const name = SLAYER_NAMES[m[1]!] ?? m[1]!;
  return [{ type: "slayer", name, level: Number(m[2]), text: `${name} Slayer ${m[2]}` }];
}

export function parseReputationReq(req: string | null | undefined): Requirement[] {
  if (!req) return [];
  const m = /^([A-Z_]+):(\d+)$/.exec(req);
  if (!m) return [{ type: "unverified", text: `reputation ${req}` }];
  const faction = m[1]!.charAt(0) + m[1]!.slice(1).toLowerCase();
  return [{ type: "reputation", faction, amount: Number(m[2]), text: `${faction} reputation ${m[2]}` }];
}

/** true = met, false = not met, null = cannot be checked (unverified text or unknown profile value). */
export function isMet(r: Requirement, p: Profile): boolean | null {
  switch (r.type) {
    case "hotm": return p.hotmTier >= r.tier;
    case "collection": {
      const have = p.collections[r.name];
      return have == null ? false : have >= r.tier;
    }
    case "slayer": return (p.slayers[r.name] ?? 0) >= r.level;
    case "skill": return (p.skills?.[r.name] ?? 0) >= r.level;
    case "reputation": return (p.reputation[r.faction] ?? 0) >= r.amount;
    case "enchanting": return p.enchantingLevel >= r.level;
    case "xp_levels": return p.xpLevels >= r.levels;
    case "forge": return p.hotmTier >= 2;
    default: return null;
  }
}

export function unmet(reqs: Requirement[], p: Profile): Requirement[] {
  if (p.ignoreRequirements) return [];
  return reqs.filter(r => isMet(r, p) === false);
}

export function dedupeRequirements(reqs: Requirement[]): Requirement[] {
  const seen = new Map<string, Requirement>();
  for (const r of reqs) {
    const key = r.type === "collection" ? `c:${r.name}` : r.type === "hotm" ? "hotm" : r.type === "slayer" ? `s:${r.name}` : r.type === "skill" ? `k:${r.name}`
      : r.type === "enchanting" ? "ench" : r.type === "xp_levels" ? "xp" : r.text;
    const prev = seen.get(key);
    const rank = (x: Requirement) => ("tier" in x ? x.tier : "level" in x ? x.level : "levels" in x ? x.levels : "amount" in x ? x.amount : 0);
    if (!prev || rank(r) > rank(prev)) seen.set(key, r);
  }
  return [...seen.values()];
}
