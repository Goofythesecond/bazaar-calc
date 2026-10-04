// Tests: verified game rules, instant trades walking the book, NEU parsing, and every calculator on a real market
// snapshot (packages/shared/test-data/fixture.json).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BAZAAR, DEFAULT_PROFILE, DEFAULT_SETTINGS, actionSeconds, bazaarFlips, bookFlips, booksNeeded, canCombineInto, computeFlags,
  blendFlow, bookCeiling, craftFlips, enchantRules, evaluate, sellLeg, typicalPrice, forgeDurationSeconds, forgeFlips, forgeSlots, fusionFlips, fusionWays, katFlips, isMet, playFactor, limitContribution, orderSlots, parseBookId, parseCraftText,
  parseNeuItem, plan, prettyName, quickForgeReduction, sbFormat, taxRate, termStart, type Ctx, type ItemMarket, type Recipe,
} from "../index.js";

const fx = JSON.parse(readFileSync(new URL("../../test-data/fixture.json", import.meta.url), "utf8"));

function ctx(over: Partial<typeof DEFAULT_SETTINGS> = {}): Ctx {
  const market = new Map<string, ItemMarket>();
  for (const m of fx.market as ItemMarket[]) { const c = { ...m, name: prettyName(m.id, m.name === m.id ? null : m.name) }; computeFlags(c); market.set(c.id, c); }
  const recipes = new Map<string, Recipe[]>();
  for (const r of fx.recipes as Recipe[]) recipes.set(r.outputId, [...(recipes.get(r.outputId) ?? []), r]);
  return { market, recipes, settings: { ...DEFAULT_SETTINGS, ...over }, profile: { ...DEFAULT_PROFILE, hotmTier: 7, quickForgeLevel: 20 } };
}

describe("verified game rules", () => {
  it("bazaar slots and tax (wiki)", () => {
    expect([0, 1, 2].map(orderSlots)).toEqual([14, 21, 28]);
    expect(taxRate(0)).toBeCloseTo(0.0125);
    expect(taxRate(2)).toBeCloseTo(0.01);
    expect(BAZAAR.maxUnitsPerOrder).toBe(71680);
  });
  it("daily limit counts each action up to the 32-bit cap (SkyHanni / Bazaar Utils)", () => {
    expect(limitContribution(5e9)).toBe(2147483647);
    expect(limitContribution(1e6)).toBe(1e6);
    expect(BAZAAR.dailyLimitDefault).toBe(15e9);
  });
  it("forge slots and Quick Forge (wiki + NEU hotmlayout)", () => {
    expect([1, 2, 3, 7, 10].map(forgeSlots)).toEqual([0, 2, 3, 7, 7]);
    expect(quickForgeReduction(1)).toBeCloseTo(0.105);
    expect(quickForgeReduction(19)).toBeCloseTo(0.195);
    expect(quickForgeReduction(20)).toBeCloseTo(0.3);
    expect(forgeDurationSeconds(10800, { quickForgeLevel: 20, coleMoltenForge: true })).toBeCloseTo(10800 * 0.45);
  });
  it("Dedication combines only up to III; IV is visitor-only (wiki)", () => {
    const d = enchantRules().ENCHANTMENT_DEDICATION!;
    expect(d.combine_cap).toBe(3);
    expect(canCombineInto(d, 3)).toBe(true);
    expect(canCombineInto(d, 4)).toBe(false);
    expect(booksNeeded(d, 1, 3)).toBe(4);
    expect(booksNeeded(d, 3, 4)).toBeNull();
  });
  it("Sharpness VI/VII cannot be made by combining", () => {
    const s = enchantRules().ENCHANTMENT_SHARPNESS!;
    expect(s.combine_cap).toBe(5);
    expect(canCombineInto(s, 6)).toBe(false);
  });
  it("book ids", () => {
    expect(parseBookId("ENCHANTMENT_ULTIMATE_WISE_5")).toEqual({ enchant: "ENCHANTMENT_ULTIMATE_WISE", level: 5 });
  });
  it("calendar: Diana term (election 516) starts 2026-09-29 23:15 UTC", () => {
    expect(new Date(termStart(516)).toISOString()).toBe("2026-09-29T23:15:00.000Z");
    expect(sbFormat(termStart(516))).toBe("Late Spring 27, Year 517");
  });
  it("action timing uses the real menu steps", () => {
    const t = { pingMs: 100, clickDelayMs: 300, typingMs: 1000 };
    // buy order: command + 4 clicks + sign
    expect(actionSeconds("create_buy_order", t)).toBeCloseTo((2 * (150 + 1000) + 4 * (150 + 300)) / 1000);
  });
});

describe("instant trades walk the book", () => {
  it("averages across levels and uses the worst visible level beyond the depth", async () => {
    const { walkBook } = await import("./index.js");
    const levels = [{ price: 10, amount: 100, orders: 1 }, { price: 12, amount: 100, orders: 1 }];
    expect(walkBook(levels, 50, 10)).toBe(10);
    expect(walkBook(levels, 200, 10)).toBe(11);
    expect(walkBook(levels, 400, 10)).toBe((1000 + 1200 + 200 * 12) / 400);
  });
});

describe("NEU parsing", () => {
  it("crafting recipe with count and collection requirement", () => {
    const r = parseNeuItem({ internalname: "ENCHANTED_DIAMOND", crafttext: "Requires: Diamond IV",
      recipes: [{ type: "crafting", A2: "DIAMOND:32", B1: "DIAMOND:32", B2: "DIAMOND:32", B3: "DIAMOND:32", C2: "DIAMOND:32", count: 1 }] });
    expect(r[0]).toMatchObject({ outputId: "ENCHANTED_DIAMOND", kind: "crafting", outputCount: 1, inputs: [{ id: "DIAMOND", qty: 160 }] });
    expect(r[0]!.requirements).toEqual([{ type: "collection", name: "Diamond", tier: 4, text: "Diamond IV collection" }]);
  });
  it("forge recipe with duration", () => {
    const r = parseNeuItem({ internalname: "UMBER_PLATE", recipes: [{ type: "forge", inputs: ["REFINED_UMBER:4.0", "GLACITE_AMALGAMATION:1.0"], count: 1, duration: 10800 }] });
    expect(r[0]).toMatchObject({ kind: "forge", durationS: 10800, inputs: [{ id: "REFINED_UMBER", qty: 4 }, { id: "GLACITE_AMALGAMATION", qty: 1 }] });
  });
  it("Kat upgrade: pets keyed as on the auction house, coins as an input", () => {
    // NotEnoughUpdates-REPO items/GRIFFIN;3.json
    const r = parseNeuItem({ internalname: "GRIFFIN;3", recipes: [{ type: "katgrade", coins: 250000, time: 86400, input: "GRIFFIN;2", output: "GRIFFIN;3", items: ["GRIFFIN_UPGRADE_STONE_EPIC:1"] }] });
    expect(r[0]).toMatchObject({ outputId: "PET_GRIFFIN_EPIC", kind: "kat", durationS: 86400, outputCount: 1,
      inputs: [{ id: "PET_GRIFFIN_RARE", qty: 1 }, { id: "GRIFFIN_UPGRADE_STONE_EPIC", qty: 1 }, { id: "SKYBLOCK_COIN", qty: 250000 }] });
    const bee = parseNeuItem({ internalname: "BEE;2", recipes: [{ type: "katgrade", coins: 0, time: 3600, input: "BEE;1", output: "BEE;2", items: ["MEDIUM_HONEY_DIPPER:1"] }] });
    expect(bee[0]!.inputs).toEqual([{ id: "PET_BEE_UNCOMMON", qty: 1 }, { id: "MEDIUM_HONEY_DIPPER", qty: 1 }]);
  });
  it("requirement text forms", () => {
    expect(parseCraftText("Requires: Gemstone X & HotM 5").map(r => r.type)).toEqual(["collection", "hotm"]);
    expect(parseCraftText("Requires: Zombie Slayer 5")[0]).toMatchObject({ type: "slayer", name: "Zombie", level: 5 });
    expect(parseCraftText("Requires Coal IV")[0]).toMatchObject({ type: "collection", name: "Coal", tier: 4 });
  });
  it("fixture recipes parsed from the real NEU repo", () => {
    expect(fx.recipes.length).toBeGreaterThan(2000);
    expect(fx.recipes.filter((r: Recipe) => r.kind === "forge").length).toBeGreaterThan(100);
  });
});

describe("calculators on real market data", () => {
  const check = (name: string, list: { coinsH: number; unitsH: number; profitPerUnit: number }[]) => {
    for (const o of list) {
      expect(Number.isFinite(o.coinsH), name).toBe(true);
      expect(o.profitPerUnit).toBeGreaterThan(0);
      expect(o.unitsH).toBeGreaterThan(0);
    }
  };
  it("bazaar flips", () => {
    const l = bazaarFlips(ctx());
    expect(l.length).toBeGreaterThan(20);
    check("bazaar", l);
    console.log("top bazaar flips", l.slice(0, 5).map(o => `${o.title}: ${Math.round(o.coinsH).toLocaleString()} c/h (${o.limitedBy})`));
  });
  it("craft flips", () => {
    const l = craftFlips(ctx());
    expect(l.length).toBeGreaterThan(5);
    check("craft", l);
    console.log("top craft flips", l.slice(0, 5).map(o => `${o.title}: ${Math.round(o.coinsH).toLocaleString()} c/h via ${o.buys.map(b => `${b.mode} ${b.qty}x ${b.name}`).join(" + ")} -> ${o.sell.mode}`));
  });
  it("book flips never combine past the wiki cap", () => {
    const l = bookFlips(ctx());
    check("book", l);
    for (const o of l) {
      const t = parseBookId(o.outputId)!;
      const s = parseBookId(o.buys[0]!.item)!;
      const rule = enchantRules()[t.enchant]!;
      expect(t.level).toBeLessThanOrEqual(rule.combine_cap!);
      expect(o.buys[0]!.qty).toBe(2 ** (t.level - s.level));
    }
    console.log("top book flips", l.slice(0, 5).map(o => `${o.title}: ${Math.round(o.coinsH).toLocaleString()} c/h`));
  });
  it("forge flips", () => {
    const l = forgeFlips(ctx());
    check("forge", l);
    console.log("top forge flips", l.slice(0, 5).map(o => `${o.title}: ${Math.round(o.coinsH).toLocaleString()} c/h, ${o.steps.at(-1)?.label}`));
  });
  it("planner respects slots, coins and the daily limit", () => {
    const c = ctx();
    const all = [...bazaarFlips(c), ...craftFlips(c), ...bookFlips(c), ...forgeFlips(c)];
    const p = plan(all, c.settings, c.profile);
    expect(p.totals.ordersUsed).toBeLessThanOrEqual(p.totals.orderSlots);
    expect(p.totals.capitalUsed).toBeLessThanOrEqual(c.settings.coins + 1);
    expect(p.totals.limitCoinsDay).toBeLessThanOrEqual(c.settings.dailyLimit * 1.0001);
    expect(new Set(p.picks.map(x => x.outputId)).size).toBe(p.picks.length);
    console.log("plan", p.totals, p.picks.map(x => `${x.kind}:${x.title} ${Math.round(x.coinsH).toLocaleString()}`));
  });

  it("planner: more coins never plan less, tiny picks are dropped, and it says what limits it", () => {
    const c = ctx();
    const all = [...bazaarFlips(c), ...craftFlips(c), ...bookFlips(c), ...forgeFlips(c)];
    const totals = [1e8, 1e9, 1e10].map(coins => plan(all, { ...c.settings, coins }, c.profile));
    for (let i = 1; i < totals.length; i++) expect(totals[i]!.totals.coinsH).toBeGreaterThanOrEqual(totals[i - 1]!.totals.coinsH * 0.995);
    for (const p of totals) {
      expect(p.picks.every(o => o.coinsH >= Math.min(100_000, p.totals.coinsH * 0.01) - 1e-6)).toBe(true);
      expect(p.totals.ordersUsed).toBeLessThanOrEqual(p.totals.orderSlots);
      expect(typeof p.totals.limitedBy).toBe("string");
    }
  });

  it("one trade at a time holds one side's order slots, not both; a forge wait is part of the round", () => {
    const fill = { basis: "measured" as const, stats: null, flowH: 100, samples: Array.from({ length: 20 }, () => [600, 1000 / 6, 0] as [number, number, number]) };
    const route = {
      kind: "craft" as const, key: "t", title: "t", outputId: "OUT", requirements: [], flags: [], notes: [],
      buys: [{ item: "A", name: "A", qty: 1, mode: "order" as const, price: 10, flowH: 100, share: 1, undercutsH: 0, fill }, { item: "B", name: "B", qty: 1, mode: "order" as const, price: 10, flowH: 100, share: 1, undercutsH: 0, fill }],
      steps: [] as { type: "forge"; label: string; opsPerUnit: number; forgeSeconds: number; outputPerOp: number; requirements: never[] }[],
      sell: { item: "OUT", name: "Out", mode: "offer" as const, grossPrice: 30, netPrice: 29.6, flowH: 100, share: 1, undercutsH: 0, fill },
    };
    const S = { ...DEFAULT_SETTINGS, coins: 1e9 };
    const seq = evaluate(route, S, DEFAULT_PROFILE), both = evaluate(route, { ...S, overlapOrders: true }, DEFAULT_PROFILE);
    expect(seq.oneAtATime).toBe(true);
    expect(seq.ordersUsed).toBe(2);   // two buy orders, then one sell offer: never three at once
    expect(both.ordersUsed).toBe(3);
    // a 2 h forge between buying and selling: the round takes longer, so fewer units per hour
    const forged = evaluate({ ...route, kind: "forge" as const, steps: [{ type: "forge" as const, label: "f", opsPerUnit: 1, forgeSeconds: 7200, outputPerOp: 1, requirements: [] }] }, S, { ...DEFAULT_PROFILE, hotmTier: 7 });
    expect(forged.unitsH).toBeLessThan(seq.unitsH);
    expect(forged.explain.join(" ")).toMatch(/wait for the forge/);
  });

  it("play hours: fill speed follows how busy the bazaar is in your hours (UTC, wraps past midnight)", () => {
    const flat = Array(24).fill(1), busy = flat.map((_, h) => (h >= 18 ? 2 : 0.5));
    expect(playFactor(null, 18, 4)).toEqual({ bid: 1, ask: 1 });
    expect(playFactor({ buy: busy, sell: flat, days: 3 }, -1, 4)).toEqual({ bid: 1, ask: 1 });
    expect(playFactor({ buy: busy, sell: flat, days: 3 }, 22, 4).ask).toBeCloseTo((2 + 2 + 0.5 + 0.5) / 4, 9); // 22, 23 busy; 0, 1 quiet
    expect(playFactor({ buy: busy, sell: flat, days: 3 }, 22, 4).bid).toBe(1);
    expect(playFactor({ buy: busy, sell: flat, days: 3 }, 18, 1.5).ask).toBeCloseTo(2, 9); // a part hour counts in part
  });

  it("every order in a route uses the same batch: you sell exactly what you bought", () => {
    const c = ctx();
    const all = [...bazaarFlips(c), ...craftFlips(c), ...bookFlips(c), ...forgeFlips(c)];
    let checked = 0;
    for (const o of all) {
      for (const l of o.orderPlan) {
        const perUnit = l.side === "sell" ? 1 : o.buys.find(b => b.item === l.item && b.mode === "order")!.qty;
        const total = Math.max(1, Math.round(o.batch * perUnit));
        expect(l.parallel).toBe(Math.ceil(total / l.maxQty));
        expect(l.qty).toBe(Math.ceil(total / l.parallel));
        expect(l.qty).toBeLessThanOrEqual(l.maxQty);
        checked++;
      }
      if (o.unitsH > 0) expect(o.capitalUsed).toBeLessThanOrEqual(o.capitalAllocated * 1.0001);
      // the chosen batch is (within the 0.5% we allow for preferring smaller batches) never beaten by an alternative
      for (const b of o.batchOptions) expect(b.unitsH, `${o.key} batch ${b.batch}`).toBeLessThanOrEqual(o.unitsH * 1.006 + 1e-9);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("a forge slot runs only while you play, plus the run you start before logging off", () => {
    const route = {
      kind: "forge" as const, key: "t", title: "t", outputId: "OUT", requirements: [], flags: [], notes: [],
      buys: [{ item: "IN", name: "In", qty: 1, mode: "instant" as const, price: 1, flowH: 1e9, share: null, undercutsH: null }],
      steps: [{ type: "forge" as const, label: "f", opsPerUnit: 1, forgeSeconds: 3600, outputPerOp: 1, requirements: [] }],
      sell: { item: "OUT", name: "Out", mode: "instant" as const, grossPrice: 100, netPrice: 98.75, flowH: 1e9, share: null, undercutsH: null },
    };
    const o = evaluate(route, { ...DEFAULT_SETTINGS, hoursPerDay: 4, coins: 1e12 }, { ...DEFAULT_PROFILE, hotmTier: 7 }, 1e12, { forgeSlots: 7 });
    // 1 h forge, 4 h of play: 4 runs while playing + 1 overnight = 5 runs per slot per day; 7 slots -> 35/day = 8.75 per hour played
    expect(o.caps.find(c => c.name === "forge slots")!.unitsH).toBeCloseTo(8.75, 6);
    expect(o.forgeSlotsUsed).toBeLessThanOrEqual(7);
    // whole runs: a 6 h forge with 4 h of play is ONE run per slot per day (start at login, finishes offline): 7/day
    const six = evaluate({ ...route, steps: [{ ...route.steps[0]!, forgeSeconds: 6 * 3600 }] }, { ...DEFAULT_SETTINGS, hoursPerDay: 4, coins: 1e12 }, { ...DEFAULT_PROFILE, hotmTier: 7 }, 1e12, { forgeSlots: 7 });
    expect(six.caps.find(c => c.name === "forge slots")!.unitsH * 4).toBeCloseTo(7, 6);
    // coins: every slot holding one run of inputs (7 x 1 coin) plus at least one unit of stock in hand (1 coin)
    expect(six.capitalUsed).toBeLessThanOrEqual(7 * 1 + 1 + 1e-6);
  });

  it("Kat flips: pet bought and sold at the lowest BIN, AH fees and Kat's fee counted, one pet at a time", () => {
    const c = ctx();
    const pet = (id: string, bin: number, sales: number) => ({ id, name: id, ts: 0, ask: null, bid: null, askVolume: 0, bidVolume: 0, askOrders: 0, bidOrders: 0,
      ibuyWeek: 0, isellWeek: 0, undercutBuyH: null, undercutSellH: null, liveHours: 0, flags: [], flagWhy: {}, ahLowestBin: bin, ahSales24h: sales }) as unknown as ItemMarket;
    c.market.set("PET_T_RARE", pet("PET_T_RARE", 1e6, 48));
    c.market.set("PET_T_EPIC", pet("PET_T_EPIC", 5e6, 24));
    c.recipes.set("PET_T_EPIC", [{ outputId: "PET_T_EPIC", kind: "kat", inputs: [{ id: "PET_T_RARE", qty: 1 }, { id: "SKYBLOCK_COIN", qty: 250_000 }], outputCount: 1, durationS: 86400, requirements: [] }]);
    const o = katFlips(c).find(x => x.key.startsWith("kat:PET_T_EPIC"))!;
    expect(o).toBeTruthy();
    // 5M BIN: 1% listing fee (under 10M) and 1% claim tax (sales above 1M) -> 5M x (1 - 0.01 - 0.01) = 4.9M kept
    expect(o.sell.netPrice).toBeCloseTo(4.9e6, 0);
    expect(o.profitPerUnit).toBeCloseTo(4.9e6 - 1e6 - 250_000, 0);
    // one 24 h upgrade at a time, 4 h of play: one a day
    const kat = o.caps.find(x => x.name.startsWith("Kat"))!;
    expect(kat.unitsH * DEFAULT_SETTINGS.hoursPerDay).toBeCloseTo(1, 6);
  });

  it("Kat routes need the Taming level for the new rarity (wiki: Kat)", () => {
    const c = ctx();
    const pet = (id: string, bin: number) => ({ id, name: id, ts: 0, ask: null, bid: null, askVolume: 0, bidVolume: 0, askOrders: 0, bidOrders: 0,
      ibuyWeek: 0, isellWeek: 0, undercutBuyH: null, undercutSellH: null, liveHours: 0, flags: [], flagWhy: {}, ahLowestBin: bin, ahSales24h: 24 }) as unknown as ItemMarket;
    c.market.set("PET_T_LEGENDARY", pet("PET_T_LEGENDARY", 1e6)); c.market.set("PET_T_MYTHIC", pet("PET_T_MYTHIC", 9e6));
    c.recipes.set("PET_T_MYTHIC", [{ outputId: "PET_T_MYTHIC", kind: "kat", inputs: [{ id: "PET_T_LEGENDARY", qty: 1 }], outputCount: 1, durationS: 3600, requirements: [] }]);
    const o = katFlips(c).find(x => x.key === "kat:PET_T_MYTHIC")!;
    const req = o.requirements.find(r => r.type === "skill")!;
    expect(req).toMatchObject({ name: "Taming", level: 25 });
    expect(isMet(req, { ...DEFAULT_PROFILE, skills: { Taming: 24 } })).toBe(false);
    expect(isMet(req, { ...DEFAULT_PROFILE, skills: { Taming: 25 } })).toBe(true);
  });

  it("fusion flips: the cheapest pair the machine offers, wiki amounts, Foraging 12 for Galatea", () => {
    const c = ctx();
    const way = fusionWays().get("WILD_HOG")!.find(w => [w.a, w.b].sort().join() === "GROUNDHOG,HONEYHOG")!;
    expect(way).toMatchObject({ count: 2, type: "special" });
    const shard = (id: string, ask: number, bid: number) => ({ id, name: id, ts: 0, ask, bid, askVolume: 1e5, bidVolume: 1e5, askOrders: 50, bidOrders: 50,
      ibuyWeek: 1e5, isellWeek: 1e5, undercutBuyH: 1, undercutSellH: 1, liveHours: 100, flags: [], flagWhy: {},
      topAsk: [{ price: ask, amount: 1e5, orders: 50 }], topBid: [{ price: bid, amount: 1e5, orders: 50 }] }) as unknown as ItemMarket;
    c.market = new Map([["SHARD_HONEYHOG", shard("SHARD_HONEYHOG", 100_000, 90_000)], ["SHARD_GROUNDHOG", shard("SHARD_GROUNDHOG", 20_000, 15_000)], ["SHARD_WILD_HOG", shard("SHARD_WILD_HOG", 500_000, 400_000)]]);
    const list = fusionFlips(c);
    const inst = list.find(o => o.key === "fusion:SHARD_WILD_HOG" && o.buys.every(b => b.mode === "instant") && o.sell.mode === "instant")
      ?? list.find(o => o.key.startsWith("fusion:SHARD_WILD_HOG"))!;
    // 5 Honeyhog + 5 Groundhog make 2 Wild Hog: 2.5 of each per shard made
    expect(inst.buys.map(b => [b.item, b.qty]).sort()).toEqual([["SHARD_GROUNDHOG", 2.5], ["SHARD_HONEYHOG", 2.5]]);
    expect(inst.requirements).toContainEqual(expect.objectContaining({ type: "skill", name: "Foraging", level: 12 }));
    const cost = inst.buys.reduce((a, b) => a + b.qty * b.price, 0);
    expect(inst.profitPerUnit).toBeCloseTo(inst.sell.netPrice - cost, 6);
  });

  it("flags a pumped price as likely manipulated and never prices a sale above the typical level", () => {
    const base = {
      id: "X", name: "X", ts: 0, ask: 250, bid: 90, askVolume: 40, bidVolume: 5000, askOrders: 4, bidOrders: 20, ibuyWeek: 1680, isellWeek: 1680,
      undercutBuyH: 1, undercutSellH: 1, liveHours: 10, flags: [], flagWhy: {},
      ref: { askMed: 100, bidMed: 90, spreadMed: 0.1, days: 14, ask24: 100, bid24: 90, n24: 20, ask7: 100, bid7: 90, n7: 100, askVol24: 2000, bidVol24: 5000 },
      topBid: [{ price: 90, amount: 100, orders: 5 }, { price: 89, amount: 100, orders: 5 }], topAsk: [{ price: 250, amount: 40, orders: 4 }],
    } as ItemMarket;
    const m = { ...base }; computeFlags(m);
    expect(m.flags).toContain("likely_manipulated");
    expect(m.flagWhy.likely_manipulated).toMatch(/150% above their typical 100/);
    expect(typicalPrice(m, "ask")).toEqual({ price: 100, basis: "24 h median", hours: 20 });
    const c = ctx();
    const leg = sellLeg({ ...c, market: new Map([["X", m]]) }, m, "offer");
    expect(leg.grossPrice).toBeCloseTo(109.9, 9);
    expect(leg.currentPrice).toBeCloseTo(249.9, 9);
    const calm = { ...base, ask: 101, askVolume: 2000 } as ItemMarket; computeFlags(calm);
    expect(calm.flags).not.toContain("likely_manipulated");
    expect(sellLeg({ ...c, market: new Map([["X", calm]]) }, calm, "offer").currentPrice).toBeUndefined();
  });

  it("blends old and new flow: a quiet stretch does not zero a rare item", () => {
    expect(blendFlow(0.36, 0, 6)).toBeCloseTo((0.36 * 6) / 12, 9);   // 6 quiet hours keep half the weekly rate
    expect(blendFlow(100, 75, 24)).toBeCloseTo((75 * 24 + 100 * 6) / 30, 9);
    expect(blendFlow(100, 500, 24)).toBe(100);                         // never above the 7-day rate
    expect(blendFlow(100, null, 0)).toBe(100);
  });

  it("a book's sale is never priced above a higher level of the same enchant", () => {
    const mk = (id: string, ask: number, bid: number) => ({ id, name: id, ask, bid } as ItemMarket);
    const market = new Map([["ENCHANTMENT_X_4", mk("ENCHANTMENT_X_4", 12_000_000, 380_000)], ["ENCHANTMENT_X_5", mk("ENCHANTMENT_X_5", 3_809_868, 2_311_855)]]);
    expect(bookCeiling(market, "ENCHANTMENT_X_4")).toEqual({ price: 3_809_868, item: "ENCHANTMENT_X_5" });
    expect(bookCeiling(market, "ENCHANTMENT_X_5")).toBeNull();
    expect(bookCeiling(market, "ENCHANTED_DIAMOND")).toBeNull();
  });

  it("flags mass delists (far more pulled than traded) as information, and as evidence with a price signal", () => {
    const base = {
      id: "Y", name: "Y", ts: 0, ask: 101, bid: 90, askVolume: 5000, bidVolume: 5000, askOrders: 20, bidOrders: 20, ibuyWeek: 16800, isellWeek: 16800,
      undercutBuyH: 1, undercutSellH: 1, liveHours: 20, flags: [], flagWhy: {},
      ref: { askMed: 100, bidMed: 90, spreadMed: 0.12, days: 14, ask24: 100, bid24: 90, n24: 20, ask7: 100, bid7: 90, n7: 100, askVol24: 5000, bidVol24: 5000,
        delists: { hours: 20, bidRemoved: 2_000_000, bidTrades: 2_000, askRemoved: 2_000, askTrades: 2_000 } },
    } as ItemMarket;
    const m = { ...base }; computeFlags(m);
    expect(m.flags).toContain("mass_delists");
    expect(m.flagWhy.mass_delists).toMatch(/2,000,000 units pulled from buy orders vs ~2,000 really traded/);
    expect(m.flags).not.toContain("likely_manipulated"); // alone it is only information
    const pumped = { ...base, ask: 150 } as ItemMarket; computeFlags(pumped);
    expect(pumped.flags).toContain("likely_manipulated"); // price 50% above typical + delists = two signals
  });
  it("times a flip as one trade (buy, then sell) unless you keep buying while selling", () => {
    const one = bazaarFlips(ctx()), both = bazaarFlips(ctx({ overlapOrders: true }));
    const pairs = one.filter(o => o.orderPlan.some(l => l.side === "buy") && o.orderPlan.some(l => l.side === "sell") && o.unitsH > 0)
      .map(o => [o, both.find(b => b.key === o.key)!] as const).filter(([, b]) => b);
    expect(pairs.length).toBeGreaterThan(10);
    // one trade at a time holds only one side's coins, so when coins are the limit it can even be a little faster
    for (const [a, b] of pairs) { expect(a.oneAtATime).toBe(true); if (b.limitedBy !== "your coins") expect(a.unitsH).toBeLessThanOrEqual(b.unitsH * 1.006); } // batches are picked within 0.5% of the best rate
    expect(pairs.some(([a, b]) => a.unitsH < b.unitsH * 0.9)).toBe(true);
  });
});
