import { describe, expect, it } from "vitest";
import { neuToHypixelId, parseNeuItem, parseStack } from "./neu.js";

describe("NEU ids and NPC shops", () => {
  it("maps damage-value ids to bazaar ids", () => {
    expect(neuToHypixelId("INK_SACK-4")).toBe("INK_SACK:4");
    expect(neuToHypixelId("LOG-3")).toBe("LOG:3");
    expect(parseStack("RAW_FISH-1:32")).toEqual({ id: "RAW_FISH:1", qty: 32 });
    expect(neuToHypixelId("SHARPNESS;6")).toBe("ENCHANTMENT_SHARPNESS_6");
    expect(neuToHypixelId("ENCHANTED_DIAMOND")).toBe("ENCHANTED_DIAMOND");
  });

  it("reads coin-only NPC shop entries and skips trades", () => {
    const rs = parseNeuItem({ internalname: "AN_NPC", displayname: "§9An (NPC)", island: "crimson_isle", recipes: [
      { type: "npc_shop", cost: ["SKYBLOCK_COIN:20"], result: "SAND-1" },
      { type: "npc_shop", cost: ["SKYBLOCK_COIN:5", "BLAZE_ROD:1"], result: "MAGMA_CREAM" },
    ] });
    expect(rs).toEqual([{ outputId: "SAND:1", kind: "npc", inputs: [{ id: "SKYBLOCK_COIN", qty: 20 }], outputCount: 1, requirements: [], source: "An (crimson isle)" }]);
  });
});
