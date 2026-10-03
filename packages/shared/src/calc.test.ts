import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BAZAAR, DEFAULT_PROFILE, DEFAULT_SETTINGS, actionSeconds, bazaarFlips, bookFlips, booksNeeded, canCombineInto, computeFlags,
  blendFlow, bookCeiling, craftFlips, enchantRules, evaluate, sellLeg, typicalPrice, forgeDurationSeconds, forgeFlips, forgeSlots, limitContribution, orderSlots, parseBookId, parseCraftText,
  parseNeuItem, plan, prettyName, quickForgeReduction, sbFormat, taxRate, termStart, type Ctx, type ItemMarket, type Recipe,
} from "./index.js";

const fx = JSON.parse(readFileSync(new URL("../test-data/fixture.json", import.meta.url), "utf8"));

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
    expect(blendFlow(0.36, 0, 6)).toBeCloseTo((0.36 * 12) / 18, 9);  // 6 quiet hours keep 2/3 of the weekly rate
    expect(blendFlow(100, 75, 24)).toBeCloseTo((75 * 24 + 100 * 12) / 36, 9);
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
});
