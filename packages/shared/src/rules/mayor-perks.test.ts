// Tests: mayor / minister perks that change the rules (wiki "Derpy", "Diaz", "Shop", "Cole"; checked 2026-10-03).
import { describe, expect, it } from "vitest";
import { BAZAAR, describePerks, npcBuyLimit, perkEffects, taxRate } from "../index.js";

describe("mayor perks", () => {
  it("QUAD TAXES!!! makes bazaar tax 4x at every Bazaar Flipper level", () => {
    expect(taxRate(0, true)).toBeCloseTo(0.05);
    expect(taxRate(1, true)).toBeCloseTo(0.045);
    expect(taxRate(2, true)).toBeCloseTo(0.04);
    expect(taxRate(2)).toBeCloseTo(0.01);
  });
  it("Shopping Spree raises NPC buy limits from 640 to 6,400; the NPC sell cap is 500M coins a day", () => {
    expect(npcBuyLimit()).toBe(640);
    expect(npcBuyLimit(true)).toBe(6400);
    expect(BAZAAR.npcDailySellCoins).toBe(500_000_000);
  });
  it("recognises perks of the mayor and of the minister by name", () => {
    expect(perkEffects({ perks: ["TURBO MINIONS!!!", "QUAD TAXES!!!", "DOUBLE MOBS HP!!!"] })).toEqual({ coleMoltenForge: false, quadTaxes: true, shoppingSpree: false });
    expect(perkEffects({ perks: ["Mythological Ritual"], minister: { perk: "Shopping Spree" } })).toEqual({ coleMoltenForge: false, quadTaxes: false, shoppingSpree: true });
    expect(perkEffects({ perks: ["Molten Forge"] }).coleMoltenForge).toBe(true);
    expect(perkEffects(undefined)).toEqual({ coleMoltenForge: false, quadTaxes: false, shoppingSpree: false });
    expect(describePerks(perkEffects({ perks: ["QUAD TAXES!!!"] }))).toHaveLength(1);
  });
});
