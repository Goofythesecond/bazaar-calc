// Parse NotEnoughUpdates-REPO item files (MIT, (c) Moulberry) into recipes + requirements.
import type { Recipe } from "./types.js";
import { parseCraftText, parseReputationReq, parseSlayerReq, type Requirement, enchantRules } from "../rules/index.js";

let enchantNames: Set<string> | null = null;
const isEnchant = (name: string) => (enchantNames ??= new Set(Object.keys(enchantRules()).map(k => k.replace(/^ENCHANTMENT_/, "")))).has(name);

export interface NeuItem {
  internalname: string;
  displayname?: string;
  crafttext?: string;
  slayer_req?: string;
  reputation_req?: string;
  recipe?: Record<string, string | number>;
  recipes?: Array<Record<string, unknown>>;
  island?: string;
}

const SLOTS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];

/** "ENCHANTED_DIAMOND:32" / "REFINED_UMBER:4.0" -> {id, qty}. NEU uses ";" inside ids for pets/books, e.g. "SHARPNESS;6". */
export function parseStack(s: string): { id: string; qty: number } | null {
  if (!s) return null;
  const i = s.lastIndexOf(":");
  const rawId = i > 0 ? s.slice(0, i) : s;
  const qty = i > 0 ? Number(s.slice(i + 1)) : 1;
  if (!rawId || !Number.isFinite(qty) || qty <= 0) return null;
  return { id: neuToHypixelId(rawId), qty };
}

/** NEU ids -> Hypixel / bazaar ids. Books: "SHARPNESS;6" -> "ENCHANTMENT_SHARPNESS_6". */
export function neuToHypixelId(id: string): string {
  const m = /^([A-Z0-9_]+);(\d+)$/.exec(id);
  // "NAME;N" is an enchanted book only for real enchants: NEU writes pets the same way ("BEE;0" = common Bee pet)
  if (m && !id.startsWith("PET") && isEnchant(m[1]!)) return `ENCHANTMENT_${m[1]}_${m[2]}`;
  // damage-value items: NEU "INK_SACK-4" (lapis), "LOG-3" (jungle log) = bazaar "INK_SACK:4", "LOG:3"
  const d = /^([A-Z0-9_]+)-(\d+)$/.exec(id);
  if (d) return `${d[1]}:${d[2]}`;
  return id;
}

function gridInputs(grid: Record<string, unknown>): { id: string; qty: number }[] {
  const by = new Map<string, number>();
  for (const k of SLOTS) {
    const st = parseStack(String(grid[k] ?? ""));
    if (st) by.set(st.id, (by.get(st.id) ?? 0) + st.qty);
  }
  return [...by].map(([id, qty]) => ({ id, qty }));
}

/** NEU pet "BEE;2" -> the auction key of that pet and rarity, "PET_BEE_RARE" (NEU numbers rarities 0 = common ... 5 = mythic). */
const PET_TIERS = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];
export function petAuctionKey(neuPet: string): string | null {
  const m = /^([A-Z0-9_]+);(\d)$/.exec(neuPet);
  return m && PET_TIERS[Number(m[2])] ? `PET_${m[1]}_${PET_TIERS[Number(m[2])]}` : null;
}

export function parseNeuItem(item: NeuItem): Recipe[] {
  const reqs: Requirement[] = [...parseCraftText(item.crafttext), ...parseSlayerReq(item.slayer_req), ...parseReputationReq(item.reputation_req)];
  const out: Recipe[] = [];
  const self = neuToHypixelId(item.internalname);
  const add = (r: Recipe) => { if (r.inputs.length && r.outputCount > 0) out.push(r); };
  if (item.recipe && !item.recipes) {
    add({ outputId: self, kind: "crafting", inputs: gridInputs(item.recipe), outputCount: Number(item.recipe.count ?? 1) || 1, requirements: reqs });
  }
  for (const r of item.recipes ?? []) {
    const type = (r.type as string | undefined) ?? "crafting";
    const outputId = neuToHypixelId(String(r.overrideOutputId ?? item.internalname));
    if (type === "crafting") {
      add({ outputId, kind: "crafting", inputs: gridInputs(r), outputCount: Number(r.count ?? 1) || 1, requirements: reqs });
    } else if (type === "npc_shop") {
      // NPC shops: only purchases paid purely in coins (not trades for other items)
      const cost = (r.cost as string[] | undefined ?? []).map(parseStack);
      const res = parseStack(String(r.result ?? ""));
      if (!res || !cost.length || cost.some(c => !c || c.id !== "SKYBLOCK_COIN")) continue;
      const npc = String(item.displayname ?? item.internalname).replace(/§./g, "").replace(/\s*\(NPC\)\s*$/, "");
      out.push({ outputId: res.id, kind: "npc", inputs: [{ id: "SKYBLOCK_COIN", qty: cost.reduce((a, c) => a + c!.qty, 0) }], outputCount: res.qty, requirements: [],
        source: `${npc}${item.island ? ` (${item.island.replace(/_/g, " ")})` : ""}` });
    } else if (type === "katgrade") {
      // Kat: the pet one rarity up for coins, items and time (wiki: Kat). The coin cost falls 0.3% per pet level; the
      // base cost is kept (an upper bound: auctioned pets' levels are unknown)
      const input = petAuctionKey(String(r.input ?? "")), output = petAuctionKey(String(r.output ?? ""));
      const items = ((r.items as string[] | undefined) ?? []).map(parseStack).filter((x): x is { id: string; qty: number } => !!x);
      const coins = Number(r.coins ?? 0), time = Number(r.time ?? 0);
      if (!input || !output || !(time >= 0)) continue;
      add({ outputId: output, kind: "kat", inputs: [{ id: input, qty: 1 }, ...items, ...(coins > 0 ? [{ id: "SKYBLOCK_COIN", qty: coins }] : [])],
        outputCount: 1, durationS: time, requirements: [] });
    } else if (type === "forge") {
      const inputs = (r.inputs as string[] | undefined ?? []).map(parseStack).filter((x): x is { id: string; qty: number } => !!x);
      add({ outputId, kind: "forge", inputs, outputCount: Number(r.count ?? 1) || 1, durationS: Number(r.duration ?? 0) || null, requirements: reqs });
    }
  }
  return out;
}
