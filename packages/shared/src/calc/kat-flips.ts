// Kat flips, the sixth flip type: buy a pet on the auction house, have Kat raise it one rarity, sell the result there.
//  - recipes: NotEnoughUpdates-REPO "katgrade" (coins, items, time), pets keyed by type and rarity ("PET_BEE_RARE")
//  - Kat cares for one pet at a time (wiki: Kat); the engine counts her like a one-slot forge, with the run that
//    finishes while you are offline
//  - both pets are priced at the lowest BIN of their rarity: auctioned pets' levels, held items and skins are not known
//    here (a high-level pet sells for more), so the route says so; the sale keeps the lowest BIN minus the AH fees
//  - Kat's coin cost falls 0.3% per pet level: the base cost is used (an upper bound)
//  - Taming level needed for the rarity Kat raises a pet to (wiki: Kat): Uncommon 1, Rare 5, Epic 10, Legendary 20,
//    Mythic 25; she refuses a pet holding a Tier Boost; the pet keeps its experience, so its level is recalculated (lower)
// Items Kat asks for (Honey Dippers, upgrade stones...) are bought like any ingredient: bazaar, NPC shop or crafted.
import { type Requirement, ahBinFeeText, ahBinNet } from "../rules/index.js";
import type { BuyLeg, BuyMode, Opportunity, Route, SellLeg } from "./engine.js";
import { type Acq, type Ctx, acquire, bestOf, mergeLegs, nameOf, scale, skip } from "./routes.js";

const BUY_MODES: BuyMode[] = ["order", "instant"];
const TAMING: Record<string, number> = { UNCOMMON: 1, RARE: 5, EPIC: 10, LEGENDARY: 20, MYTHIC: 25 };

/** An item Kat asks for that the bazaar, NPCs and crafting cannot supply (upgrade stones): its lowest BIN. */
function fromAuction(ctx: Ctx, id: string): Acq | null {
  const m = ctx.market.get(id);
  if (!m?.ahLowestBin) return null;
  return { price: m.ahLowestBin, how: "market", legs: [{ item: id, name: m.name, qty: 1, mode: "ah", price: m.ahLowestBin, flowH: (m.ahSales24h ?? 0) / 24, share: null, undercutsH: null }], steps: [], reqs: [] };
}

export function katFlips(ctx: Ctx): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [outKey, recipes] of ctx.recipes) {
    for (const r of recipes.filter(x => x.kind === "kat")) {
      const key = `kat:${outKey}`, title = `${nameOf(ctx, r.inputs[0]!.id)} → ${nameOf(ctx, outKey)}`;
      const petIn = ctx.market.get(r.inputs[0]!.id), petOut = ctx.market.get(outKey);
      if (!petIn?.ahLowestBin) { skip(ctx, "kat", key, title, "no BIN of the starting pet on the auction house right now"); continue; }
      if (!petOut?.ahLowestBin) { skip(ctx, "kat", key, title, "no BIN of the upgraded pet on the auction house to price the sale"); continue; }
      const coins = r.inputs.find(i => i.id === "SKYBLOCK_COIN")?.qty ?? 0;
      const items = r.inputs.slice(1).filter(i => i.id !== "SKYBLOCK_COIN");
      const pet: BuyLeg = { item: petIn.id, name: petIn.name, qty: 1, mode: "ah", price: petIn.ahLowestBin, flowH: (petIn.ahSales24h ?? 0) / 24, share: null, undercutsH: null };
      const fee: BuyLeg[] = coins > 0 ? [{ item: "KAT_FEE", name: "Kat's fee", qty: 1, mode: "fee", price: coins, flowH: Infinity, share: null, undercutsH: null }] : [];
      const sell: SellLeg = { item: outKey, name: petOut.name, mode: "ah_reference", grossPrice: petOut.ahLowestBin, netPrice: ahBinNet(petOut.ahLowestBin, ctx.profile.quadTaxes),
        flowH: (petOut.ahSales24h ?? 0) / 24, share: null, undercutsH: null,
        priceBasis: `lowest BIN of that rarity on the auction house (any level), minus ${ahBinFeeText(petOut.ahLowestBin, ctx.profile.quadTaxes)}` };
      const rarity = /_([A-Z]+)$/.exec(outKey)?.[1] ?? "", taming = TAMING[rarity];
      const reqs: Requirement[] = taming ? [{ type: "skill", name: "Taming", level: taming, text: `Taming ${taming} (Kat upgrades to ${rarity.toLowerCase()})` }] : [];
      const hours = (r.durationS ?? 0) / 3600;
      const routes: Route[] = [];
      let why: string | null = null;
      for (const bm of BUY_MODES) {
        const parts: Acq[] = [];
        let ok = true;
        for (const it of items) {
          const a = acquire(ctx, it.id, bm, 1, new Set([outKey])) ?? fromAuction(ctx, it.id);
          if (!a) { ok = false; why ??= `no way to get ${nameOf(ctx, it.id)} right now`; break; }
          parts.push(scale(a, it.qty));
        }
        if (!ok) continue;
          routes.push({
          kind: "kat", key, title, outputId: outKey,
          buys: [pet, ...mergeLegs(parts.flatMap(x => x.legs)), ...fee],
          steps: [...parts.flatMap(x => x.steps), { type: "kat", label: `Kat raises the pet one rarity (${hours < 1 ? `${Math.round(hours * 60)} min` : `${+hours.toFixed(1)} h`})`,
            opsPerUnit: 1, forgeSeconds: Math.max(1, r.durationS ?? 0), outputPerOp: 1, requirements: [] }],
          sell, requirements: [...reqs, ...parts.flatMap(x => x.reqs)],
          flags: ["bought and sold on the auction house: lowest BINs of each rarity, any level (a high-level pet sells for more)",
            ...parts.flatMap(x => x.legs.flatMap(l => ctx.market.get(l.item)?.flags.map(f => `${l.name}: ${f}`) ?? []))].filter(f => !f.endsWith("low_history")),
          notes: [`Kat's fee ${coins.toLocaleString("en-US")} coins at level 1 (0.3% less per pet level); one pet at a time`,
            "take off a Tier Boost first (Kat refuses it); the pet keeps its experience, so its level is recalculated for the new rarity"],
        });
      }
      if (!routes.length) { skip(ctx, "kat", key, title, why ?? "the items Kat needs cannot be priced"); continue; }
      out.push(...bestOf(ctx, routes));
    }
  }
  return out.sort((a, b) => b.coinsH - a.coinsH);
}
