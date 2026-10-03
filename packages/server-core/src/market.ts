// Build the calculator's Market (shared types) from the database.
import zlib from "node:zlib";
import { type GameEvent, type ItemMarket, type ItemStats, type MayorTerm, type Recipe, assembleMarket, calendarEvents, mayorEvents, realtimeEvents, unpackLevels } from "@bc/shared";
import type { Db } from "./db.js";
import { loadHoldStats } from "./hold.js";

// the full depth Hypixel publishes (up to 30 levels): instant trades walk it
const unpack = (b: Buffer | null) => (b ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(b))) : []);

export type { ItemStats };

export async function loadMarket(db: Db): Promise<Map<string, ItemMarket>> {
  const [latest, stats, ah, items, hold] = await Promise.all([
    db.query("SELECT item_id, extract(epoch from ts) * 1000 AS ts, ask_top, bid_top, ask_volume, bid_volume, ask_orders, bid_orders, ibuy_week, isell_week, bids, asks FROM bazaar_latest"),
    db.query("SELECT item_id, data FROM item_stats"),
    // the active-auction scan runs every 30 min; a key nobody lists any more keeps its old row, so ignore stale ones
    db.query("SELECT item_key, lowest_bin, sales_24h, median_sale_24h FROM ah_latest WHERE ts > now() - interval '2 hours'"),
    db.query("SELECT id, name FROM items"),
    loadHoldStats(db),
  ]);
  return assembleMarket({
    quotes: latest.rows.map(r => ({ id: r.item_id, ts: Number(r.ts), ask: r.ask_top != null ? r.ask_top / 100 : null, bid: r.bid_top != null ? r.bid_top / 100 : null,
      askVolume: r.ask_volume ?? 0, bidVolume: r.bid_volume ?? 0, askOrders: r.ask_orders ?? 0, bidOrders: r.bid_orders ?? 0,
      ibuyWeek: r.ibuy_week ?? 0, isellWeek: r.isell_week ?? 0, bids: unpack(r.bids), asks: unpack(r.asks) })),
    stats: new Map(stats.rows.map(r => [r.item_id as string, r.data as ItemStats])),
    hold,
    ah: new Map(ah.rows.map(r => [r.item_key as string, { lowestBin: r.lowest_bin != null ? r.lowest_bin / 100 : null, sales24h: r.sales_24h ?? 0,
      medianSale24h: r.median_sale_24h != null ? r.median_sale_24h / 100 : null }])),
    names: new Map(items.rows.map(r => [r.id as string, r.name as string | null])),
  });
}

export async function loadRecipes(db: Db): Promise<Map<string, Recipe[]>> {
  const res = await db.query("SELECT output_id, kind, inputs, output_count, duration_s, requirements, requirement_text FROM recipes");
  const out = new Map<string, Recipe[]>();
  for (const r of res.rows) {
    const rec: Recipe = { outputId: r.output_id, kind: r.kind, inputs: r.inputs, outputCount: Number(r.output_count), durationS: r.duration_s, requirements: r.requirements, ...(r.kind === "npc" ? { source: r.requirement_text ?? undefined } : {}) };
    out.set(rec.outputId, [...(out.get(rec.outputId) ?? []), rec]);
  }
  return out;
}

export async function loadMayors(db: Db, from = 0, to = Date.now() + 30 * 86400_000): Promise<(MayorTerm & { votes: number | null; candidates: unknown })[]> {
  const res = await db.query(
    `SELECT election_year, mayor_name, extract(epoch from start_ts) * 1000 AS s, extract(epoch from end_ts) * 1000 AS e, perks, minister, votes, candidates
     FROM mayors WHERE end_ts >= to_timestamp($1 / 1000.0) AND start_ts <= to_timestamp($2 / 1000.0) ORDER BY election_year`, [from, to]);
  return res.rows.map(r => ({ electionYear: r.election_year, name: r.mayor_name, start: Number(r.s), end: Number(r.e),
    perks: (r.perks as { name: string }[]).map(p => p.name), minister: r.minister, votes: r.votes, candidates: r.candidates }));
}

export async function loadEvents(db: Db, from: number, to: number): Promise<GameEvent[]> {
  const terms = await loadMayors(db, from, to);
  return [...calendarEvents(from, to), ...realtimeEvents(from, to), ...mayorEvents(terms)]
    .filter(e => e.end > from && e.start < to).sort((a, b) => a.start - b.start);
}

/** Is Cole's Molten Forge active right now (mayor or minister)? */
export async function moltenForgeActive(db: Db, now = Date.now()): Promise<boolean> {
  const t = (await loadMayors(db, now, now)).find(m => m.start <= now && m.end > now);
  return !!t && (t.perks.some(p => p.toLowerCase() === "molten forge") || (t.minister?.perk ?? "").toLowerCase() === "molten forge");
}
