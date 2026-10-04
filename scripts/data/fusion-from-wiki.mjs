#!/usr/bin/env node
// Builds packages/shared/src/rules/fusion.json (shard fusion rules) from the wiki's attribute-fusion data page,
// hypixelskyblock.minecraft.wiki/w/User:Wiki_Editor_33/AttributeFusion ("Full Info table", CC BY-NC-SA 3.0: facts, with
// attribution). One entry per shard: rarity, ID number, category, families, its special-fusion recipe (two input
// conditions), whether ID fusion / Chameleon fusion may produce it, and the wiki's own ID and Chameleon results, which
// the tests compare with rules/fusion.ts.
//   node scripts/data/fusion-from-wiki.mjs            fetch the page and write the file
//   node scripts/data/fusion-from-wiki.mjs <wikitext.json>   use a saved api.php?action=parse response instead
import { readFileSync, writeFileSync } from "node:fs";

const PAGE = "User:Wiki_Editor_33/AttributeFusion";
const API = `https://hypixelskyblock.minecraft.wiki/api.php?action=parse&page=${encodeURIComponent(PAGE)}&prop=wikitext|revid&format=json`;
const OUT = new URL("../../packages/shared/src/rules/fusion.json", import.meta.url);
const RARITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const CATEGORIES = ["FOREST", "WATER", "COMBAT"];

const res = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8"))
  : await (await fetch(API, { headers: { "user-agent": "bazaar-calc (github.com/Goofythesecond/bazaar-calc)" } })).json();
const text = res.parse.wikitext["*"];
const table = text.slice(text.indexOf("==Full Info table=="), text.indexOf("===Shardnames which differ"));
if (table.length < 1000) throw new Error("Full Info table not found: the page changed, update this script");

// a cell is "|<content>"; templates: {{Item|Name Shard}}, {{color|Word}} or {{color|brown|Word}}
const strip = c => c.replace(/^\|/, "").trim();
const word = s => s.replace(/\{\{(?:color\|)?[a-z_]+\|([^}]*)\}\}/g, "$1").replace(/'''\+'''/g, "+").trim();
const items = c => [...c.matchAll(/\{\{Item\|\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)].map(m => m[1]);

const rows = table.split(/\n\|-\n(?:\|-\n)*/).filter(r => r.startsWith("|{{Item|")).map(r => r.trim().split("\n").slice(0, 20).map(strip));
// the page spells a few names two ways ("Soul Of The Alpha", "Cinder Bat" for Cinderbat): looked up without case or spaces
const norm = n => n.toLowerCase().replace(/\s+/g, "");
const nameToId = new Map(rows.map(c => [norm(items("|" + c[0])[0]), c[18].replace(/\{\{.*$/, "").trim()]));
const idOf = name => { const id = nameToId.get(norm(name)); if (!id) throw new Error(`unknown shard "${name}"`); return id; };

/** "Rare+ AND Forest", "X OR Y OR Z", "X OR Cave Dweller": all terms, or any one of them. */
function cond(c) {
  if (!c) return null;
  const mode = /\{\{red\|AND\}\}/.test(c) ? "all" : "any";
  const terms = [];
  for (const part of c.split(/\{\{(?:red\|AND|yellow\|OR)\}\}|<br>/).map(s => s.trim()).filter(Boolean)) {
    const shard = items(part);
    if (shard.length) { terms.push(...shard.map(n => ({ shard: idOf(n) }))); continue; }
    const w = word(part), up = w.endsWith("+"), key = w.replace(/\+$/, "").trim().toUpperCase().replace(/ /g, "_");
    if (RARITIES.includes(key)) terms.push({ rarity: key, up });
    else if (CATEGORIES.includes(key)) terms.push({ category: key });
    else terms.push({ family: key });
  }
  return { mode, terms };
}

const shards = {};
for (const c of rows) {
  const id = idOf(items("|" + c[0])[0]);
  const rarity = word(c[1]).toUpperCase();
  if (!RARITIES.includes(rarity)) throw new Error(`${id}: rarity "${c[1]}"`);
  const a = cond(c[7]), b = cond(c[8]);
  shards[id] = {
    name: items("|" + c[0])[0], rarity, num: Number(c[2]), category: word(c[4]),
    families: c[5] ? c[5].split(/\s+and\s+/).map(word) : [],
    // a blank input (Apex Dragon: Power Dragon + ?) is null: the recipe is not fully known
    ...(a || b ? { recipe: [a, b] } : {}),
    ...(c[17] === "Generic Plus" ? { genericPlus: true } : {}),
    synthesized: /TRUE/.test(c[13]),
    chameleonable: /yes/.test(c[15]),
    // the wiki's own results, for the tests
    wiki: { id: items("|" + c[9]).map(idOf)[0] ?? null, chameleon: items("|" + c[11]).map(idOf) },
  };
}
// a condition on a family no shard has (Termite: Bug + "Mining") cannot be resolved from the page: marked unknown
const families = new Set(Object.values(shards).flatMap(s => s.families));
for (const s of Object.values(shards)) for (const c of s.recipe ?? []) if (c?.terms.some(t => t.family && !families.has(t.family))) c.unknown = true;
const out = { source: `https://hypixelskyblock.minecraft.wiki/w/${PAGE} (revision ${res.parse.revid}), CC BY-NC-SA 3.0`, shards };
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(shards).length} shards, ${Object.values(shards).filter(s => s.recipe).length} special recipes (${Object.values(shards).filter(s => s.recipe?.some(c => !c || c.unknown)).length} not fully known) -> ${OUT.pathname}`);
