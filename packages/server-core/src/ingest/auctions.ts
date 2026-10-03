// Auction-house ingestion. Only aggregates per item key and anonymous sale prices are kept: seller / buyer / bidder
// ids are never stored (Hypixel's policy forbids building player histories).
import zlib from "node:zlib";
import { type Auction, type BinAgg, type EndedAuction, aggregateBins, auctionItemKey } from "@bc/shared";
import { type Db, ensurePartition, insertMany } from "../db.js";
import { fetchAuctionsEndedIfChanged, fetchAuctionsPage, fetchAuctionsPage0IfChanged } from "../hypixel.js";

export type { BinAgg };

/** Item key + stack size from an auction's item_bytes (base64 gzipped NBT); see auctionItemKey. */
export function itemInfo(itemBytes: string): { key: string; count: number } | null {
  try { return auctionItemKey(new Uint8Array(zlib.gunzipSync(Buffer.from(itemBytes, "base64")))); } catch { return null; }
}

export const aggregateAuctions = (auctions: Auction[], into?: Map<string, BinAgg>) => aggregateBins(auctions, itemInfo, into);

/** Fetch every active-auction page and store lowest-BIN aggregates. Skips the whole scan (45 pages, ~60 MB) when page 0
 *  has not changed since the last scan. */
export async function ingestActiveAuctions(db: Db, origin = 1): Promise<{ keys: number; pages: number; ts: number; listings: number } | { status: "unchanged" }> {
  let first = await fetchAuctionsPage0IfChanged();
  if (!first) return { status: "unchanged" };
  // Hypixel refreshes the listing about once a minute and a full scan (45 pages, ~60 MB) can take 20-45 s, so a scan
  // often straddles a refresh. Pages are fetched in parallel; if the listing changed mid-scan, one retry with more
  // parallel requests. A scan with EVERY page is stored even if it spans two consecutive listings (they overlap almost
  // entirely); a scan with missing pages never is (that once produced lowest BINs from 1,000 of 44,000 auctions).
  const scan = async (head: NonNullable<typeof first>, parallel: number) => {
    const rest: { lastUpdated: number; auctions: Auction[] }[] = [];
    const pages = Array.from({ length: head.totalPages - 1 }, (_, i) => i + 1);
    for (let i = 0; i < pages.length; i += parallel) rest.push(...await Promise.all(pages.slice(i, i + parallel).map(p => fetchAuctionsPage(p))));
    return rest;
  };
  let rest = await scan(first, 8);
  if (rest.some(p => p.lastUpdated !== first!.lastUpdated)) {
    const again = await fetchAuctionsPage(0);
    first = again;
    rest = await scan(again, 16);
  }
  const listings = new Set([first.lastUpdated, ...rest.map(p => p.lastUpdated)]).size;
  const agg = await aggregateAuctions(first.auctions);
  for (const p of rest) await aggregateAuctions(p.auctions, agg);
  await storeBinAggregates(db, first.lastUpdated, agg, origin);
  return { keys: agg.size, pages: first.totalPages, ts: first.lastUpdated, listings };
}

export async function storeBinAggregates(db: Db, ts: number, agg: Map<string, BinAgg>, origin: number): Promise<void> {
  const iso = new Date(ts).toISOString();
  const rows = [...agg].map(([k, a]) => [k, iso, Number.isFinite(a.lowest) ? Math.round(a.lowest * 100) : null, a.second == null ? null : Math.round(a.second * 100), a.bins, a.total, origin]);
  await ensurePartition(db, "ah_bin_snapshots", ts);
  await insertMany(db, "ah_bin_snapshots", ["item_key", "ts", "lowest_bin", "second_bin", "bin_count", "auction_count", "origin"], rows);
  await insertMany(db, "ah_latest", ["item_key", "ts", "lowest_bin", "second_bin", "bin_count", "auction_count"], rows.map(r => r.slice(0, 6)),
    "ON CONFLICT (item_key) DO UPDATE SET ts = excluded.ts, lowest_bin = excluded.lowest_bin, second_bin = excluded.second_bin, bin_count = excluded.bin_count, auction_count = excluded.auction_count WHERE ah_latest.ts <= excluded.ts");
}

/** Store ended auctions (sale prices only). Returns rows inserted. */
export async function ingestEndedAuctions(db: Db, ended?: EndedAuction[], origin = 1): Promise<number> {
  const list = ended ?? (await fetchAuctionsEndedIfChanged())?.auctions;
  if (!list) return 0; // nothing changed since the last minute
  const rows: unknown[][] = [];
  for (const a of list) {
    const info = itemInfo(a.item_bytes);
    if (!info) continue;
    rows.push([a.auction_id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"), info.key, new Date(a.timestamp).toISOString(), Math.round((a.price / info.count) * 100), a.bin, origin]);
  }
  for (const ts of new Set(list.map(a => a.timestamp))) await ensurePartition(db, "ah_sales", ts);
  return insertMany(db, "ah_sales", ["auction_id", "item_key", "ts", "price", "bin", "origin"], rows);
}
