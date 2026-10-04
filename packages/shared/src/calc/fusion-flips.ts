// Fusion flips, the seventh flip type: buy two kinds of attribute shards on the bazaar, fuse them in the Fusion Machine,
// sell the result on the bazaar. Which pairs make which shard, and how many go in and come out: rules/fusion.ts (wiki).
//  - per shard and buy mode, the cheapest pair at the current prices is priced as a full route (the engine then
//    caps it by supply, demand, coins, the daily limit and clicking)
//  - a pair only counts when the machine shows the shard among its 3 results (it orders them and cuts the rest)
//  - Galatea, where the Fusion Machine is, opens at Foraging 12 (wiki: Galatea); fusing costs nothing and takes no time
import { type Requirement, fusionAmount, fusionWays, shardProduct, SHARDS } from "../rules/index.js";
import type { BuyMode, Opportunity, Route } from "./engine.js";
import { type Ctx, bestOf, buyLeg, canBuy, canSell, nameOf, sellLeg, skip } from "./routes.js";

const MODES = [["order", "offer"], ["order", "instant"], ["instant", "offer"], ["instant", "instant"]] as const;
const GALATEA: Requirement = { type: "skill", name: "Foraging", level: 12, text: "Foraging 12 (Galatea, home of the Fusion Machine)" };
const TYPE_TEXT = { special: "special fusion (makes 2)", id: "ID fusion (makes 1)", chameleon: "Chameleon fusion (makes 1)" };

export function fusionFlips(ctx: Ctx): Opportunity[] {
  const out: Opportunity[] = [];
  // each shard's price per buy mode (bid for orders, ask for instant buys), once: ~119,000 pairs read them
  const price = { order: new Map<string, number>(), instant: new Map<string, number>() };
  for (const id of Object.keys(SHARDS)) for (const bm of ["order", "instant"] as BuyMode[]) {
    const x = ctx.market.get(shardProduct(id));
    if (canBuy(ctx, x, bm)) price[bm].set(id, bm === "instant" ? x.ask! : x.bid!);
  }
  for (const [target, ways] of fusionWays()) {
    const outId = shardProduct(target), m = ctx.market.get(outId), key = `fusion:${outId}`, title = SHARDS[target]!.name;
    if (!m) { skip(ctx, "fusion", key, title, "not sold on the bazaar"); continue; }
    if (!canSell(ctx, m, "offer") && !canSell(ctx, m, "instant")) { skip(ctx, "fusion", key, title, "no buy orders or sell offers to sell into on the bazaar right now (or hidden by a market warning)"); continue; }
    const routes: Route[] = [];
    for (const bm of ["order", "instant"] as BuyMode[]) {
      // cheapest pair at the price this buy mode pays
      const unit = (id: string) => price[bm].get(id) ?? null;
      let best: { w: (typeof ways)[number]; cost: number } | null = null;
      for (const w of ways) {
        const pa = unit(w.a), pb = unit(w.b);
        if (pa == null || pb == null || w.a === target || w.b === target) continue;
        const cost = (fusionAmount(w.a) * pa + fusionAmount(w.b) * pb) / w.count;
        if (!best || cost < best.cost) best = { w, cost };
      }
      if (!best) continue;
      const { a, b, count, type } = best.w;
      const legs = a === b ? [buyLeg(ctx, ctx.market.get(shardProduct(a))!, (2 * fusionAmount(a)) / count, bm)]
        : [buyLeg(ctx, ctx.market.get(shardProduct(a))!, fusionAmount(a) / count, bm), buyLeg(ctx, ctx.market.get(shardProduct(b))!, fusionAmount(b) / count, bm)];
      for (const [, sm] of MODES.filter(([x]) => x === bm)) {
        if (!canSell(ctx, m, sm)) continue;
        routes.push({
          kind: "fusion", key, title, outputId: outId, buys: legs,
          steps: [{ type: "fuse", label: `Fuse ${fusionAmount(a)}× ${SHARDS[a]!.name} + ${fusionAmount(b)}× ${SHARDS[b]!.name}: ${TYPE_TEXT[type]}`, opsPerUnit: 1 / count, outputPerOp: count, requirements: [] }],
          sell: sellLeg(ctx, m, sm), requirements: [GALATEA],
          flags: [...m.flags, ...legs.flatMap(l => ctx.market.get(l.item)?.flags.map(f => `${l.name}: ${f}`) ?? [])].filter(f => !f.endsWith("low_history")),
          notes: [`pick ${title} among the machine's results; ${ways.length} pairs can make it, this is the cheapest now`,
            ...(type !== "chameleon" && [a, b].some(x => SHARDS[x]!.families.includes("REPTILE")) ? ["a reptile fusion can come out doubled (Pure Reptile attribute): not counted"] : [])],
        });
      }
    }
    if (!routes.length) { skip(ctx, "fusion", key, title, "the shards that make it have no prices on the bazaar right now"); continue; }
    out.push(...bestOf(ctx, routes));
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}
