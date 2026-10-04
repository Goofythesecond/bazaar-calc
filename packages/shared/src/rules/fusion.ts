// Attribute-shard fusion (hypixelskyblock.minecraft.wiki/w/Attribute_Fusion and the data page
// /w/User:Wiki_Editor_33/AttributeFusion, CC BY-NC-SA 3.0; data in fusion.json, built by scripts/data/fusion-from-wiki.mjs):
//  - two shards go in (the same kind twice is allowed: Galaxy Fish's recipe is Sun Fish + Sun Fish); the machine offers up
//    to 3 results and you pick one. Fusing costs no coins and takes no time ("Fusions are infinite!", Kysha)
//  - input amount per shard: Chameleon 1; Elemental, Amphibian, Eel, Crocodile and Reptile families (incl. Lizard,
//    Scaled, Serpent, Turtle) 2; any other 5
//  - results, in this priority until 3 are found:
//      1. Chameleon fusion (one input is a Chameleon): the other shard's next 3 IDs of its rarity; an ID that does not
//         exist is replaced by the next first-IDs of the rarity above (none above Legendary), a shard that cannot be
//         chameleon-fused leaves its slot empty; nothing else is offered
//      2. special fusions whose two conditions the inputs meet (either order), highest rarity then highest ID first,
//      3. special fusions of recipe type "Generic Plus", same order,
//      4. ID fusion: each input's result is the first shard at ID +3, +6, ... of its rarity with the same category that
//         is synthesized and has no special recipe (unless Generic Plus); inputs of one category give one result (the
//         higher-rarity input's; same rarity: see fusionResults), of different categories both
//  - recipes the wiki leaves open, Termite's (Bug + a "Mining" family no shard has) and Apex Dragon's (Power Dragon +
//    blank), are never offered as results; where they might apply they count as possible rivals for a slot
//    a result is never one of the inputs
//  - outputs: Chameleon and ID fusion 1 shard, special fusion 2
// Not modelled: Pure Reptile (Crocodile shard's attribute: a 2-20% chance to double a reptile fusion's output).
import data from "./fusion.json" with { type: "json" };

export type ShardRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";
type Term = { shard: string } | { rarity: ShardRarity; up: boolean } | { category: string } | { family: string };
export interface ShardCond { mode: "all" | "any"; terms: Term[]; /** names a family no shard has: cannot be checked */ unknown?: boolean }
export interface Shard {
  name: string; rarity: ShardRarity; num: number; category: string; families: string[];
  /** special-fusion recipe; an input is null when the wiki leaves it blank */
  recipe?: [ShardCond | null, ShardCond | null]; genericPlus?: boolean; synthesized: boolean; chameleonable: boolean;
  /** the wiki's own ID-fusion and Chameleon results (the tests compare them with this file) */
  wiki: { id: string | null; chameleon: string[] };
}
export interface FusionResult { shard: string; count: number; type: "chameleon" | "special" | "id";
  /** offered whatever the order among results of one rarity (which the sources describe differently), and not an ID
   *  result of two shards of one rarity and category; only these are used for routes */
  sure: boolean }

export const FUSION_SOURCE: string = data.source;
export const SHARDS = data.shards as unknown as Record<string, Shard>;
const RANKS: ShardRarity[] = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const rank = (r: ShardRarity) => RANKS.indexOf(r);
const TWO = new Set(["ELEMENTAL", "AMPHIBIAN", "EEL", "CROCO", "REPTILE", "LIZARD", "SCALED", "SERPENT", "TURTLE"]);

/** Bazaar product of a shard: SHARD_ + its internal name (all 321 shard products on the bazaar, 2026-10-05). */
export const shardProduct = (id: string) => `SHARD_${id}`;
/** How many of this shard one fusion uses. */
export const fusionAmount = (id: string) => id === "CHAMELEON" ? 1 : SHARDS[id]!.families.some(f => TWO.has(f)) ? 2 : 5;

let byNum: Map<string, string> | null = null;
const at = (r: ShardRarity, n: number) => (byNum ??= new Map(Object.entries(SHARDS).map(([id, s]) => [`${s.rarity}-${s.num}`, id]))).get(`${r}-${n}`);
const maxNums = new Map<ShardRarity, number>();
const maxNum = (r: ShardRarity) => maxNums.get(r) ?? maxNums.set(r, Math.max(...Object.values(SHARDS).filter(s => s.rarity === r).map(s => s.num))).get(r)!;

const idCache = new Map<string, string | null>();
/** ID fusion: the first shard at +3, +6, ... of the same rarity and category that ID fusion may produce. */
export function idResult(id: string): string | null {
  if (idCache.has(id)) return idCache.get(id)!;
  const s = SHARDS[id]!, top = maxNum(s.rarity);
  let out: string | null = null;
  for (let n = s.num + 3; n <= top && !out; n += 3) {
    const t = at(s.rarity, n), x = t ? SHARDS[t]! : null;
    if (x && x.category === s.category && x.synthesized && (!x.recipe || x.genericPlus)) out = t!;
  }
  idCache.set(id, out);
  return out;
}

/** Chameleon fusion with `id`: its next 3 IDs, gaps filled from the first IDs of the rarity above. */
export function chameleonResults(id: string): (string | null)[] {
  const s = SHARDS[id]!, up = RANKS[rank(s.rarity) + 1];
  let fallback = 1;
  return [1, 2, 3].map(k => {
    const t = at(s.rarity, s.num + k) ?? (up ? at(up, fallback++) : undefined);
    return t && SHARDS[t]!.chameleonable && t !== id && t !== "CHAMELEON" ? t : null;
  });
}

/** A recipe's two conditions are fully known (not blank, no unknown family). */
const known = (s: Shard): s is Shard & { recipe: [ShardCond, ShardCond] } => !!s.recipe && s.recipe.every(c => c && !c.unknown);
const meets = (id: string, c: ShardCond) => {
  const s = SHARDS[id]!;
  const ok = (t: Term) => "shard" in t ? t.shard === id : "rarity" in t ? (t.up ? rank(s.rarity) >= rank(t.rarity) : s.rarity === t.rarity)
    : "category" in t ? s.category === t.category : s.families.includes(t.family);
  return c.mode === "all" ? c.terms.every(ok) : c.terms.some(ok);
};

/** For every pair of shards, the recipes it meets (fully known ones and ones the wiki leaves open), built once by walking
 *  each recipe's matching shards instead of checking 99 recipes for each of 52,650 pairs (11 s at first, 0.6 s with
 *  byte lookups, a fraction of that this way). Pair (i, j) with i <= j sits at i * N + j. */
let pairRecipes: { special: (string[] | undefined)[]; maybe: (string[] | undefined)[] } | null = null;
let index: Map<string, number> | null = null;
function pairsMeeting() {
  if (pairRecipes) return pairRecipes;
  const ids = Object.keys(SHARDS), N = ids.length;
  index = new Map(ids.map((id, i) => [id, i]));
  const special: (string[] | undefined)[] = [], maybe: (string[] | undefined)[] = [];
  const all = ids.map((_, i) => i);
  // a blank or unknown condition (null): anything might meet it
  const matching = (c: ShardCond | null) => (!c || c.unknown ? all : all.filter(i => meets(ids[i]!, c)));
  for (const [t, sh] of Object.entries(SHARDS)) {
    if (!sh.recipe) continue;
    const into = known(sh) ? special : maybe, ti = index.get(t)!, seen = new Set<number>();
    const A = matching(sh.recipe[0]), B = matching(sh.recipe[1]);
    for (const i of A) for (const j of B) {
      const k = i <= j ? i * N + j : j * N + i;
      // a recipe never makes one of its inputs
      if (i === ti || j === ti || seen.has(k)) continue;
      seen.add(k);
      (into[k] ??= []).push(t);
    }
  }
  return (pairRecipes = { special, maybe });
}

/** The (up to 3) results the Fusion Machine offers for two shards, in its order (`limit`: more, for checks). */
export function fusionResults(a: string, b: string, limit = 3): FusionResult[] {
  if (a === "CHAMELEON" || b === "CHAMELEON") {
    const other = a === "CHAMELEON" ? b : a;
    return other === "CHAMELEON" ? [] : chameleonResults(other).flatMap(t => (t ? [{ shard: t, count: 1, type: "chameleon" as const, sure: true }] : []));
  }
  const order = (x: string, y: string) => rank(SHARDS[y]!.rarity) - rank(SHARDS[x]!.rarity) || SHARDS[y]!.num - SHARDS[x]!.num;
  // recipes the wiki leaves open (blank or unknown input) that these inputs might meet are never a result here, but in
  // the game they could take a slot, so a result they could push out is not "sure"
  const pr = pairsMeeting(), ia = index!.get(a)!, ib = index!.get(b)!, N = index!.size, k = ia <= ib ? ia * N + ib : ib * N + ia;
  const special = pr.special[k] ?? [], maybe = pr.maybe[k] ?? [];
  const ids: string[] = [];
  const sa = SHARDS[a]!, sb = SHARDS[b]!;
  if (sa.category === sb.category) {
    // one result: the higher-rarity input's (none if it has none); same rarity: the lower ID's, unless that is the other
    // input, then the other's. The wiki's two descriptions differ for one rarity (the data page: the lower ID's; the
    // pseudocode on the Attribute Fusion page: the second-selected shard's), so such results are never "sure"
    let r: string | null;
    if (sa.rarity !== sb.rarity) r = idResult(rank(sa.rarity) > rank(sb.rarity) ? a : b);
    else { const [lo, hi] = sa.num <= sb.num ? [a, b] : [b, a]; r = idResult(lo); if (r === hi) r = idResult(hi); }
    if (r && r !== a && r !== b) ids.push(r);
  } else ids.push(...[idResult(a), idResult(b)].filter((t): t is string => !!t && t !== a && t !== b).sort(order));
  // every candidate in the machine's order, with its group (special, Generic Plus, ID) for the "sure" test
  const all: { t: string; count: number; type: FusionResult["type"]; group: number }[] = [];
  const add = (t: string, count: number, type: FusionResult["type"], group: number) => { if (!all.some(x => x.t === t)) all.push({ t, count, type, group }); };
  for (const t of special.filter(t => !SHARDS[t]!.genericPlus).sort(order)) add(t, 2, "special", 0);
  for (const t of special.filter(t => SHARDS[t]!.genericPlus).sort(order)) add(t, 2, "special", 1);
  for (const t of ids) add(t, 1, "id", 2);
  const sameKind = sa.category === sb.category && sa.rarity === sb.rarity;
  return all.slice(0, limit).map((x, i) => {
    // results ahead of it in any tie order: earlier groups, higher rarities, and every other one of its group and rarity
    const ahead = all.filter((y, j) => j !== i && (y.group < x.group || (y.group === x.group && rank(SHARDS[y.t]!.rarity) >= rank(SHARDS[x.t]!.rarity)))).length
      + maybe.filter(m => x.group > 0 || rank(SHARDS[m]!.rarity) >= rank(SHARDS[x.t]!.rarity)).length;
    return { shard: x.t, count: x.count, type: x.type, sure: ahead < 3 && !(x.type === "id" && sameKind) };
  });
}

export interface FusionWay { a: string; b: string; count: number; type: FusionResult["type"] }
let ways: Map<string, FusionWay[]> | null = null;
/** Every pair of shards sure to be offered each shard (pairs either way round count once), built once. */
export function fusionWays(): Map<string, FusionWay[]> {
  if (ways) return ways;
  ways = new Map();
  const ids = Object.keys(SHARDS);
  for (let i = 0; i < ids.length; i++) for (let j = i; j < ids.length; j++) {
    for (const r of fusionResults(ids[i]!, ids[j]!)) if (r.sure) {
      const list = ways.get(r.shard) ?? [];
      list.push({ a: ids[i]!, b: ids[j]!, count: r.count, type: r.type });
      ways.set(r.shard, list);
    }
  }
  return ways;
}
