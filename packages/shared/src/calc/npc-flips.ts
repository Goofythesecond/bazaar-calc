// NPC flips, the fifth flip type, in both directions:
//   bazaar -> NPC   buy on the bazaar (buy order or instant buy), sell to an NPC shop at its fixed price. The sale pays
//                   no bazaar tax, but NPC shops pay out at most 500M coins per profile per day (00:00 UTC).
//   NPC -> bazaar   buy from an NPC shop (at most 640 of an item a day per merchant, 6,400 under Diaz's Shopping Spree),
//                   sell on the bazaar (sell offer or instant sell, taxed like any bazaar sale).
// Rules: rules/bazaar.ts (wiki "Shop", checked 2026-10-03). Craft flips never buy from an NPC what the bazaar sells, so
// these routes do not overlap them.
import { npcBuyLimit } from "../rules/index.js";
import type { BuyMode, Opportunity, Route, SellMode } from "./engine.js";
import { type Ctx, bestOf, buyLeg, canBuy, canSell, nameOf, sellLeg, skip } from "./routes.js";

const BUY_MODES: BuyMode[] = ["order", "instant"];
const SELL_MODES: SellMode[] = ["offer", "instant"];

export function npcFlips(ctx: Ctx): Opportunity[] {
  const out: Opportunity[] = [];
  // bazaar -> NPC
  for (const m of ctx.market.values()) {
    const npc = m.npcSellPrice;
    if (!npc || npc <= 0 || (m.ask == null && m.bid == null)) continue;
    const key = `npc:${m.id}:to-npc`, title = `${m.name} → NPC`;
    const routes: Route[] = [];
    for (const mode of BUY_MODES) {
      if (!canBuy(ctx, m, mode)) continue;
      routes.push({ kind: "npc", key, title, outputId: m.id, buys: [buyLeg(ctx, m, 1, mode)], steps: [],
        sell: { item: m.id, name: m.name, mode: "npc", grossPrice: npc, netPrice: npc, flowH: Infinity, share: null, undercutsH: null },
        requirements: [], flags: [...m.flags], notes: ["Sold to any NPC shop (they buy most items); no bazaar tax on the sale"] });
    }
    if (!routes.length) { skip(ctx, "npc", key, title, "no bazaar prices to buy from right now"); continue; }
    out.push(...bestOf(ctx, routes));
  }
  // NPC -> bazaar: one route per merchant (each has its own daily limit)
  for (const [id, recipes] of ctx.recipes) for (const r of recipes) {
    if (r.kind !== "npc" || r.inputs[0]?.id !== "SKYBLOCK_COIN") continue;
    const m = ctx.market.get(id);
    const onBazaar = !!m && (m.ask != null || m.bid != null || m.ibuyWeek > 0 || m.isellWeek > 0);
    if (!onBazaar) continue; // nothing to sell into: not a flip
    const price = r.inputs[0].qty / r.outputCount, merchant = r.source ?? "NPC";
    const key = `npc:${id}:from:${merchant}`, title = `${nameOf(ctx, id)} from ${merchant} → bazaar`;
    const routes: Route[] = [];
    for (const mode of SELL_MODES) {
      if (!canSell(ctx, m, mode)) continue;
      routes.push({ kind: "npc", key, title, outputId: id,
        buys: [{ item: id, name: nameOf(ctx, id), qty: 1, mode: "npc", source: merchant, price,
          flowH: npcBuyLimit(ctx.profile.npcShoppingSpree) / Math.max(0.1, ctx.settings.hoursPerDay), share: null, undercutsH: null }],
        steps: [], sell: sellLeg(ctx, m!, mode), requirements: r.requirements, flags: [...m!.flags],
        notes: [`Bought from ${merchant}: at most ${npcBuyLimit(ctx.profile.npcShoppingSpree).toLocaleString("en-US")} a day`] });
    }
    if (!routes.length) { skip(ctx, "npc", key, title, "no bazaar buyers or sellers for it right now"); continue; }
    out.push(...bestOf(ctx, routes));
  }
  return out;
}
