// Tests: spreading the top picks over visitors (spreadPicks): only near-equal routes, stable per visitor and day.
import { describe, expect, it } from "vitest";
import { spreadPicks } from "./endpoints.js";

const rows = [100, 98, 97, 95, 93, 91, 60, 50].map((s, i) => ({ key: `r${i}`, scoreH: s }));

describe("spreadPicks", () => {
  it("picks only among routes within 10% of the best, best first, the same all day for one visitor", () => {
    const a = spreadPicks(rows, "visitor-a|2026-10-04");
    expect(a).toHaveLength(3);
    for (const r of a) expect(r.scoreH).toBeGreaterThanOrEqual(90);
    expect(a.map(r => r.scoreH)).toEqual([...a.map(r => r.scoreH)].sort((x, y) => y - x));
    expect(spreadPicks(rows, "visitor-a|2026-10-04")).toEqual(a);
  });
  it("gives different visitors different picks", () => {
    const sets = new Set(Array.from({ length: 20 }, (_, i) => spreadPicks(rows, `v${i}|2026-10-04`).map(r => r.key).join()));
    expect(sets.size).toBeGreaterThan(3);
  });
  it("shows everyone the same top picks when few are close to the best", () => {
    const few = [100, 95, 40, 30].map((s, i) => ({ key: `r${i}`, scoreH: s }));
    expect(spreadPicks(few, "x").map(r => r.key)).toEqual(["r0", "r1", "r2"]);
  });
});
