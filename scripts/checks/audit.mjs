#!/usr/bin/env node
// Audit every route the running site lists against raw sources. Usage: node scripts/checks/audit.mjs [baseUrl]
//  1. arithmetic: cost = sum of legs, tax, profit, coins/h
//  2. prices vs the exact market snapshot the calculator used (GET /api/v1/market), drift vs Hypixel reported
//  3. flow: nothing fills more than the whole market trades (Hypixel 7-day / 168)
//  4. batches: buy order = batch x recipe amount, sell offer = batch; 71,680 / 1B caps; coins; daily limit
//  5. books: every combinable enchant level on the bazaar has a route or a stated reason; caps; 2^(t-s) books
//  6. recipes: a sample of stored recipes equals NotEnoughUpdates-REPO's raw item files
//  7. comparison with skyblock.bz (independent site): coverage, profitable/not agreement, their formula
//  9. order caps: 71,680 per order, 256 for unstackable items; AH-sold outputs keep the lowest BIN minus the AH fees
// 10. Kat: pets at the snapshot's lowest BIN, Kat's coins / items / pets equal NEU's katgrade, Taming by rarity (wiki: Kat)
// 11. fusion: input amounts by the wiki's rule (Chameleon 1, reptile / elemental / amphibian / eel families 2, else 5), every
//     pair in SkyShards' independent pair table with the same output count (github.com/Campionnn/SkyShards, MIT; a check only)
//  8. NPC flips: NPC sale = the item's npc_sell_price in Hypixel's items resource, with no tax, 500M coins a day; merchant price = the stored NEU shop
//     price; at most 640 a day (6,400 in a Shopping Spree) bought from a merchant
const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
// default settings: Bazaar Flipper level 0, 4 hours a day; tax as the server applies it now (x4 under QUAD TAXES!!!)
const bzRules = await (await fetch(`${BASE}/api/v1/rules/bazaar`)).json();
const TAX = bzRules.taxByFlipperLevel[0], HOURS = 4, SPREE = (bzRules.activePerks ?? []).some(p => /shopping spree/i.test(p));
const post = async (p, b) => (await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();
const get = async u => { const r = await fetch(u, { headers: { "user-agent": "bazaar-calc audit" } }); if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.json(); };
const problems = new Map();
const flag = (name, x) => { if (!problems.has(name)) problems.set(name, []); problems.get(name).push(x); };
const near = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

// ---- one consistent snapshot: every route page and the market snapshot must come from the same calculator refresh
let hx, ours, snap, strict = false;
for (let attempt = 0; attempt < 6 && !strict; attempt++) {
  hx = await get("https://api.hypixel.net/v2/skyblock/bazaar");
  ours = {}; const at = new Set();
  for (const kind of ["bazaar", "craft", "book", "forge", "npc", "kat", "fusion"]) {
    const rows = []; let off = 0, total = 1, skipped = [];
    while (off < total) { const d = await post(`/api/v1/calc/${kind}`, { filters: { limit: 500, offset: off } }); rows.push(...d.rows); total = d.total; off += 500; skipped = d.skipped; at.add(d.marketAt); }
    ours[kind] = { rows, skipped: skipped.filter(s => s.kind === kind) };
  }
  snap = await get(`${BASE}/api/v1/market`);
  strict = at.size === 1 && at.has(snap.marketAt);
}
const P = hx.products, S = snap.items;
const ITEMS = (await get("https://api.hypixel.net/v2/resources/skyblock/items")).items;
const NPC_SELL = new Map(ITEMS.filter(i => i.npc_sell_price != null).map(i => [i.id, i.npc_sell_price]));
// one order holds 71,680 units, or 256 of an unstackable item (wiki: Bazaar); enchanted books are never in the items list
const UNSTACKABLE = new Set(ITEMS.filter(i => i.unstackable).map(i => i.id));
const orderCap = id => (UNSTACKABLE.has(id) || /^ENCHANTMENT_.+_\d+$/.test(id) ? 256 : 71680);
// what a BIN sale keeps (wiki: Auction House): 1% / 2% / 2.5% listing fee by price, 1% claim tax above 1M (x4 under Derpy), payout never below 1M
const AH_QUAD = (bzRules.activePerks ?? []).some(p => /quad taxes/i.test(p));
const ahNet = p => p - p * (p < 10e6 ? 0.01 : p < 100e6 ? 0.02 : 0.025) - (p > 1e6 ? Math.min(p * (AH_QUAD ? 0.04 : 0.01), p - 1e6) : 0);
// prices are checked against the snapshot the calculator used; Hypixel itself is used for the 7-day volumes
const best = (id, side) => (side === "ask" ? S[id]?.ask : S[id]?.bid) ?? null;
console.log(`snapshot: calculator market ${new Date(snap.marketAt).toISOString()} | Hypixel ${new Date(hx.lastUpdated).toISOString()} | ${strict ? "every route from this one snapshot: prices checked exactly" : "WARNING: routes span several market refreshes"}`);
const hxDrift = Object.entries(S).filter(([id, m]) => P[id] && m.bid != null && P[id].sell_summary[0] && Math.abs(P[id].sell_summary[0].pricePerUnit - m.bid) > 1e-6).length;
console.log(`our snapshot vs Hypixel right now: ${hxDrift} of ${Object.keys(S).length} best buy orders moved since (normal: 20 s polls)`);

// ---- 1-4: every route
let n = 0;
for (const [kind, { rows }] of Object.entries(ours)) for (const o of rows) {
  n++; const k = o.key;
  const cost = o.buys.reduce((a, b) => a + b.qty * b.price, 0);
  if (!near(cost, o.costPerUnit)) flag("cost != sum of ingredients", k);
  if (o.sell.mode === "npc") { if (!near(o.sell.netPrice, o.sell.grossPrice)) flag("tax charged on an NPC sale", k); }
  else if (o.sell.mode === "ah_reference") { if (!near(o.sell.netPrice, ahNet(o.sell.grossPrice))) flag("AH sale: net price != lowest BIN minus listing fee and claim tax", [k, o.sell.grossPrice, o.sell.netPrice, ahNet(o.sell.grossPrice)]); }
  else if (!near(o.sell.netPrice, o.sell.grossPrice * (1 - TAX))) flag(`tax not ${TAX * 100}%`, k);
  if (!near(o.profitPerUnit, o.sell.netPrice - cost)) flag("profit != net - cost", k);
  if (!near(o.coinsH, o.unitsH * o.profitPerUnit, 1e-4)) flag("coins/h != units/h x profit", k);
  const tol = p => (strict ? 0.051 : Math.max(0.11, 0.03 * p));
  const vol = (id, k) => S[id]?.[k] ?? P[id]?.quick_status?.[k === "isellWeek" ? "sellMovingWeek" : "buyMovingWeek"] ?? 0;
  for (const b of o.buys) {
    const ask = best(b.item, "ask"), bid = best(b.item, "bid");
    if (b.mode === "order" && bid != null && Math.abs(b.price - (bid + 0.1)) > tol(bid)) flag("buy order != best buy order + 0.1", [k, b.item, b.price, bid]);
    if (b.mode === "instant" && ask != null && b.price < ask - 1e-6 && strict) flag("instant buy below best sell offer", [k, b.item, b.price, ask]);
    if (b.mode === "npc" && kind !== "npc" && P[b.item] && (P[b.item].buy_summary.length || P[b.item].sell_summary.length)) flag("NPC price used for a bazaar item", [k, b.item]);
    if (b.mode === "npc" && kind === "npc" && o.unitsH * HOURS > (SPREE ? 6400 : 640) * 1.0001) flag("buys more from a merchant than its daily limit", [k, o.unitsH * HOURS]);
    if (b.mode === "order" && S[b.item]) { const w = vol(b.item, "isellWeek") / 168; if (o.unitsH * b.qty > w * 1.05 + 1) flag("buy order fills more than all instant sells", [k, b.item, Math.round(o.unitsH * b.qty), Math.round(w)]); }
  }
  const s = o.sell, ask = best(s.item, "ask"), bid = best(s.item, "bid");
  // the sale is priced at the lower of now and typical + 10% (typical: 24 h median with >= 6 hourly closes, else 7-day with >= 12)
  const typical = side => { const r = S[s.item]?.ref; if (!r) return null; const d = r[side + "24"], w = r[side + "7"]; return d != null && r.n24 >= 6 ? d : w != null && r.n7 >= 12 ? w : null; };
  const ta = typical("ask"), tb = typical("bid");
  // books: never above the cheapest sell offer of a higher level of the same enchant
  const bk = /^(ENCHANTMENT_.+)_(\d+)$/.exec(s.item); let ceil = Infinity;
  if (bk) for (let l = Number(bk[2]) + 1; l <= Number(bk[2]) + 10; l++) { const h = S[`${bk[1]}_${l}`]; if (h?.ask != null) ceil = Math.min(ceil, h.ask); }
  if (s.mode === "offer" && ask != null) { const want = Math.min(ask, ta != null ? 1.1 * ta : Infinity, ceil) - 0.1; if (Math.abs(s.grossPrice - want) > tol(ask)) flag("sell offer != min(best sell offer, typical) - 0.1", [k, s.grossPrice, ask, ta]); }
  if (s.mode === "instant" && bid != null && s.grossPrice > Math.min(bid, tb != null ? 1.1 * tb : Infinity) + 1e-6 && strict) flag("instant sell above best buy order / typical", [k, s.grossPrice, bid, tb]);
  if (s.mode === "npc") {
    if (!near(s.grossPrice, NPC_SELL.get(s.item) ?? NaN)) flag("NPC sale price != Hypixel's npc_sell_price", [k, s.grossPrice, NPC_SELL.get(s.item)]);
    if (!near(o.npcSellCoinsH, o.unitsH * s.grossPrice, 1e-6)) flag("NPC coins/h != units/h x NPC price", k);
    if (o.npcSellCoinsH * HOURS > 500e6 * 1.0001) flag("NPC sales above 500M coins a day", [k, o.npcSellCoinsH * HOURS]);
  }
  if (s.currentPrice != null && !(s.currentPrice > s.grossPrice)) flag("current price shown but not above the price used", k);
  if (s.mode === "offer" && S[s.item]) { const w = vol(s.item, "ibuyWeek") / 168; if (o.unitsH > w * 1.05 + 1) flag("sell offer fills more than all instant buys", [k, o.unitsH, w]); }
  if (s.mode === "instant" && S[s.item]) { const w = vol(s.item, "isellWeek") / 168; if (o.unitsH > w * 1.05 + 1) flag("instant sells more than buyers take", [k, o.unitsH, w]); }
  for (const l of o.orderPlan) {
    const per = l.side === "sell" ? 1 : o.buys.find(b => b.item === l.item && b.mode === "order").qty;
    const total = Math.max(1, Math.round(o.batch * per));
    if (l.parallel !== Math.ceil(total / l.maxQty) || l.qty !== Math.ceil(total / l.parallel)) flag("order size != batch x recipe amount", [k, l.item, l.qty, l.parallel, o.batch, per]);
    if (l.qty > orderCap(l.item)) flag("order above the per-order cap (71,680, or 256 for unstackable items)", [k, l.item, l.qty]);
    if (l.side === "sell" && l.qty * l.price > 1e9 * 1.0001) flag("sell offer above 1B", k);
  }
  if (o.unitsH > 0 && o.capitalUsed > o.capitalAllocated * 1.0001) flag("uses more coins than you have", k);
  if (o.unitsH > 0 && o.limitCoinsH * 4 > 15e9 * 1.0001) flag("above the daily limit", k);
}

// ---- 10: Kat upgrades vs the auction snapshot and NEU
const RAR = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"], TAMING = { UNCOMMON: 1, RARE: 5, EPIC: 10, LEGENDARY: 20, MYTHIC: 25 };
let katChecked = 0;
const katNeu = new Map();
for (const o of ours.kat.rows) {
  const k = o.key;
  for (const b of o.buys.filter(b => b.mode === "ah")) if (!near(b.price, S[b.item]?.ahLowestBin ?? NaN)) flag("Kat: auction buy != lowest BIN in the snapshot", [k, b.item, b.price, S[b.item]?.ahLowestBin]);
  if (!near(o.sell.grossPrice, S[o.outputId]?.ahLowestBin ?? NaN)) flag("Kat: sale != lowest BIN in the snapshot", [k, o.sell.grossPrice, S[o.outputId]?.ahLowestBin]);
  const m = /^PET_(.+)_([A-Z]+)$/.exec(o.outputId);
  const tam = o.requirements.find(r => r.type === "skill" && r.name === "Taming");
  if (!m || tam?.level !== TAMING[m[2]]) flag("Kat: Taming requirement != wiki level for the rarity", [k, tam?.level]);
  if (!m || katNeu.size >= 40 || katNeu.has(o.outputId)) continue;
  let neu; try { neu = await get(`https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items/${encodeURIComponent(`${m[1]};${RAR.indexOf(m[2])}`)}.json`); } catch { flag("Kat: NEU file not found", k); continue; }
  const r = (neu.recipes ?? []).find(x => x.type === "katgrade");
  katNeu.set(o.outputId, r);
  const petIn = r && /^(.+);(\d)$/.exec(r.input);
  if (!r || !petIn || o.buys.find(b => b.mode === "ah")?.item !== `PET_${petIn[1]}_${RAR[Number(petIn[2])]}`) { flag("Kat: starting pet != NEU input", [k, r?.input]); continue; }
  const fee = o.buys.find(b => b.mode === "fee")?.price ?? 0;
  if (fee !== (r.coins ?? 0)) flag("Kat: fee != NEU coins", [k, fee, r.coins]);
  // the items NEU lists are each acquired (bought or crafted): the route says how much of each step it needs
  katChecked++;
}

// ---- 11: fusion vs the wiki's amounts and SkyShards' independent pair table
const fusionRules = (await import("../../packages/shared/src/rules/fusion.json", { with: { type: "json" } })).default.shards;
const TWO = new Set(["ELEMENTAL", "AMPHIBIAN", "EEL", "CROCO", "REPTILE", "LIZARD", "SCALED", "SERPENT", "TURTLE"]);
const amount = id => (id === "CHAMELEON" ? 1 : fusionRules[id].families.some(f => TWO.has(f)) ? 2 : 5);
const sky = await get("https://raw.githubusercontent.com/Campionnn/SkyShards/HEAD/public/fusion-data.json");
const skyId = c => sky.shards[c].internal_id;
const skyPairs = new Map(); // "SHARD_T|SHARD_A+SHARD_B" -> output count
for (const [t, byCount] of Object.entries(sky.recipes)) for (const [cnt, pairs] of Object.entries(byCount)) for (const [a, b] of pairs) skyPairs.set(`${skyId(t)}|${[skyId(a), skyId(b)].sort().join("+")}`, Number(cnt));
let fusionChecked = 0;
for (const o of ours.fusion.rows) {
  const k = o.key, ids = o.buys.map(b => b.item.replace(/^SHARD_/, ""));
  const pair = ids.length === 1 ? [ids[0], ids[0]] : ids;
  const count = Number(/makes (\d)/.exec(o.steps[0].label)?.[1]);
  for (const b of o.buys) {
    const per = (ids.length === 1 ? 2 : 1) * amount(b.item.replace(/^SHARD_/, "")) / count;
    if (!near(b.qty, per)) flag("fusion: shards per output != wiki amount / output count", [k, b.item, b.qty, per]);
  }
  const sk = skyPairs.get(`${o.outputId}|${pair.map(x => `SHARD_${x}`).sort().join("+")}`);
  if (sk == null) flag("fusion: pair not in SkyShards' table", [k, pair.join("+")]);
  else if (sk !== count) flag("fusion: output count differs from SkyShards", [k, count, sk]);
  if (!o.requirements.some(r => r.type === "skill" && r.name === "Foraging" && r.level === 12)) flag("fusion: missing Foraging 12 (Galatea)", k);
  fusionChecked++;
}

// ---- 5: books, enumerated independently from the raw bazaar + rules
const rules = (await get(`${BASE}/api/v1/rules/enchants`)).rules;
const bookRows = new Map(ours.book.rows.map(o => [o.key.replace(/:instant$/, ""), o]));
const bookSkips = new Map(ours.book.skipped.map(s => [s.key, s]));
let levelsChecked = 0, combinable = 0;
for (const r of Object.values(rules)) {
  if (r.combine_status !== "combinable" || !r.combine_cap) continue;
  combinable++;
  const traded = l => { const p = P[`${r.id}_${l}`]; return !!p && (p.buy_summary.length > 0 || p.sell_summary.length > 0); };
  for (let t = 2; t <= r.combine_cap; t++) {
    if (!P[`${r.id}_${t}`]) continue;
    levelsChecked++;
    const key = `book:${r.id}_${t}`;
    const row = bookRows.get(key);
    if (row) {
      const src = Number(row.buys[0].item.split("_").at(-1));
      if (row.buys[0].qty !== 2 ** (t - src)) flag("book count != 2^(target - source)", key);
      continue;
    }
    if (bookSkips.has(key) || bookSkips.has(`book:${r.id}`)) continue;
    // a route should exist when some lower level can be bought and the target can be sold
    const canBuy = l => P[`${r.id}_${l}`] && (P[`${r.id}_${l}`].buy_summary.length || P[`${r.id}_${l}`].sell_summary.length);
    const lower = Array.from({ length: t - 1 }, (_, i) => i + 1).filter(l => traded(l) && canBuy(l));
    if (traded(t) && lower.length) flag("book level missing with no reason", key);
  }
  for (const row of ours.book.rows) if (row.outputId.startsWith(r.id + "_") && Number(row.outputId.split("_").at(-1)) > r.combine_cap) flag("book above its combine cap", row.key);
}

// ---- 6: recipes vs NEU raw files (sample)
const sample = [...new Set(ours.craft.rows.map(o => o.outputId))].sort().filter((_, i) => i % 7 === 0).slice(0, 40);
let recipesChecked = 0;
const neuId = id => id.replace(/^ENCHANTMENT_(.+)_(\d+)$/, "$1;$2").replace(/:(\d+)$/, "-$1");
const toBz = id => { const m = /^([A-Z0-9_]+);(\d+)$/.exec(id); if (m && !id.startsWith("PET")) return `ENCHANTMENT_${m[1]}_${m[2]}`; const d = /^([A-Z0-9_]+)-(\d+)$/.exec(id); return d ? `${d[1]}:${d[2]}` : id; };
for (const id of sample) {
  let neu;
  try { neu = await get(`https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items/${neuId(id)}.json`); } catch { flag("NEU file not found for a craft output", id); continue; }
  const grids = [...(neu.recipe && !neu.recipes ? [neu.recipe] : []), ...(neu.recipes ?? []).filter(r => (r.type ?? "crafting") === "crafting")];
  const norm = g => { const m = new Map(); for (const s of ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"]) { const v = g[s]; if (!v) continue; const i = v.lastIndexOf(":"); const iid = toBz(i > 0 ? v.slice(0, i) : v); m.set(iid, (m.get(iid) ?? 0) + (i > 0 ? Number(v.slice(i + 1)) : 1)); } return [...m].map(([i, q]) => `${i}x${q}`).sort().join(","); };
  const want = new Set(grids.map(norm));
  const have = (await get(`${BASE}/api/v1/items/${encodeURIComponent(id)}`)).recipes.filter(r => r.kind === "crafting").map(r => r.inputs.map(i => `${i.id}x${i.qty}`).sort().join(","));
  recipesChecked++;
  for (const h of have) if (!want.has(h)) flag("stored recipe not in NEU", [id, h, [...want]]);
}

// ---- 8: NPC merchant prices vs the stored NotEnoughUpdates-REPO shop recipes (sample)
let npcChecked = 0;
for (const o of ours.npc.rows.filter(o => o.key.includes(":from:")).filter((_, i) => i % 5 === 0).slice(0, 40)) {
  const b = o.buys[0];
  const shops = (await get(`${BASE}/api/v1/items/${encodeURIComponent(b.item)}`)).recipes.filter(r => r.kind === "npc" && r.requirement_text === b.source);
  npcChecked++;
  if (!shops.some(r => near(r.inputs[0].qty / r.output_count, b.price))) flag("merchant price != stored NEU shop price", [o.key, b.price, shops.map(r => r.inputs[0].qty / r.output_count)]);
}

// ---- 7: skyblock.bz
let sbz = null;
try {
  const [f, c] = await Promise.all([get("https://api.skyblock.bz/api/flips"), get("https://api.skyblock.bz/api/crafts")]);
  const ob = new Map(ours.bazaar.rows.filter(o => !o.key.endsWith(":instant")).map(o => [o.outputId, o]));
  const oc = new Map(ours.craft.rows.filter(o => !o.key.endsWith(":instant")).map(o => [o.outputId, o]));
  const fm = f.filter(x => ob.has(x.id)), cm = c.filter(x => oc.has(x.id));
  const formula = f.filter(x => near(x.marginperhour, (x.buyprice * 0.9775 - x.sellprice) * Math.min(x.instabuys, x.instasells), 1e-6)).length;
  sbz = { flips: f.length, flipsListed: fm.length, flipsAgree: fm.filter(x => (x.marginperhour > 0) === (ob.get(x.id).coinsH > 0)).length,
    crafts: c.length, craftsListed: cm.length, craftsAgree: cm.filter(x => (x.coinsperhour > 0) === (oc.get(x.id).coinsH > 0)).length,
    theirFormula: `${formula}/${f.length}`, craftsMissing: c.filter(x => !oc.has(x.id)).map(x => `${x.id} (their cost ${Math.round(x.craftcost)})`) };
} catch (e) { sbz = { error: String(e) }; }

for (const [kind, { rows, skipped }] of Object.entries(ours)) console.log(`${kind}: ${rows.length} routes listed (${rows.filter(o => o.coinsH > 0).length} profitable), ${skipped.length} not listed with a reason`);
console.log(`checked ${n} routes; books: ${combinable} combinable enchants, ${levelsChecked} target levels on the bazaar; recipes: ${recipesChecked} compared with NEU; NPC merchant prices: ${npcChecked} compared; Kat: ${katChecked} compared with NEU; fusion: ${fusionChecked} pairs compared with SkyShards`);
console.log("skyblock.bz:", JSON.stringify(sbz));
if (!problems.size) console.log("NO PROBLEMS FOUND");
for (const [name, xs] of [...problems].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(xs.length).padStart(5)}  ${name}: ${JSON.stringify(xs.slice(0, 4))}`);
process.exitCode = problems.size ? 1 : 0;
