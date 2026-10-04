// Tests: the fusion engine against the wiki's own results (ID-fusion and Chameleon columns of the data page) for every
// shard, plus the worked examples on the Attribute Fusion page.
import { describe, expect, it } from "vitest";
import { SHARDS, chameleonResults, fusionAmount, fusionResults, idResult } from "./fusion.js";

describe("shard fusion (wiki)", () => {
  const ids = Object.keys(SHARDS);
  it("has every shard", () => expect(ids.length).toBeGreaterThan(300));
  it("ID-fusion result of every shard matches the wiki", () => {
    const wrong = ids.filter(id => idResult(id) !== SHARDS[id]!.wiki.id).map(id => `${id}: ${idResult(id)} (wiki ${SHARDS[id]!.wiki.id})`);
    expect(wrong).toEqual([]);
  });
  it("Chameleon results of every shard match the wiki", () => {
    const wrong = ids.filter(id => id !== "CHAMELEON").filter(id => chameleonResults(id).filter(Boolean).join() !== SHARDS[id]!.wiki.chameleon.join())
      .map(id => `${id}: ${chameleonResults(id).join("/")} (wiki ${SHARDS[id]!.wiki.chameleon.join("/")})`);
    expect(wrong).toEqual([]);
  });
  it("input amounts: Chameleon 1, reptiles / elementals / amphibians 2, others 5", () => {
    expect([fusionAmount("CHAMELEON"), fusionAmount("SALAMANDER"), fusionAmount("GROVE"), fusionAmount("PHANPYRE")]).toEqual([1, 2, 2, 5]);
  });
  it("Chameleon + Flaming Spider = Kiwi / Sylvan / Zealot Bruiser (the page's example)", () => {
    expect(fusionResults("CHAMELEON", "FLAMING_SPIDER").map(r => r.shard)).toEqual(["KIWI", "SYLVAN", "BRUISER"]);
  });
  it("Quartzfang's recipe: Troglobyte + a Cave Dweller makes 2", () => {
    const cave = ids.find(id => id !== "TROGLOBYTE" && SHARDS[id]!.families.includes("CAVE_DWELLER"))!;
    expect(fusionResults("TROGLOBYTE", cave).find(r => r.shard === "QUARTZFANG")).toMatchObject({ count: 2, type: "special" });
  });
  it("never more than 3 results, never an input", () => {
    for (const [a, b] of [["GROVE", "MIST"], ["TROGLOBYTE", "SALAMANDER"], ["SUN_FISH", "SUN_FISH"]] as const) {
      const r = fusionResults(a, b);
      expect(r.length).toBeLessThanOrEqual(3);
      expect(r.some(x => x.shard === a || x.shard === b)).toBe(false);
    }
  });
});
