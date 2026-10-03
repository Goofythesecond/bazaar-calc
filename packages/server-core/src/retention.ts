// Keeps the database small. Measured 2026-10-03 (one day of 20 s polling): order books ~0.9 GB/day, quotes (best
// prices, volumes) ~0.5 GB/day, time-on-top episodes ~0.1 GB/day; small tables that are updated every poll bloat without
// VACUUM (the built-in database has no autovacuum: 409 MB of dead rows for 11 MB of data after one day).
//   - full order books for BOOK_DETAIL_DAYS (3), then the hourly keyframe books only
//   - full quotes for QUOTE_DETAIL_DAYS (7), then the hourly keyframe quotes only (charts, typical prices and event
//     studies older than a week work from hourly data)
//   - auction sales and lowest-BIN snapshots for 90 days, measured flow for 60 days (episodes: see hold.ts, 3 days)
import type { Db } from "./db.js";

/** Delete rows of a time-partitioned bazaar table older than `days`, except the hourly keyframe snapshots, in chunks so
 *  the single database lock is never held for long (the bazaar poll waits on it). */
async function thin(db: Db, table: "bazaar_books" | "bazaar_quotes", days: number): Promise<number> {
  let n = 0;
  for (;;) {
    const r = await db.query(
      `DELETE FROM ${table} WHERE (item_id, ts) IN (
         SELECT b.item_id, b.ts FROM ${table} b
          WHERE b.ts < now() - make_interval(days => $1) AND b.origin IN (1, 2)
            AND NOT EXISTS (SELECT 1 FROM bazaar_snapshots s WHERE s.ts = b.ts AND s.keyframe)
          LIMIT 20000)`, [days]);
    n += r.rowCount ?? 0;
    if (!r.rowCount) return n;
  }
}

export async function pruneDetail(db: Db, bookDays = Number(process.env.BOOK_DETAIL_DAYS ?? 3), quoteDays = Number(process.env.QUOTE_DETAIL_DAYS ?? 7)) {
  const books = await thin(db, "bazaar_books", bookDays);
  const quotes = await thin(db, "bazaar_quotes", quoteDays);
  const flow = (await db.query("DELETE FROM bazaar_flow_hourly WHERE hour < now() - interval '60 days'")).rowCount ?? 0;
  const sales = (await db.query("DELETE FROM ah_sales WHERE ts < now() - interval '90 days'")).rowCount ?? 0;
  const bins = (await db.query("DELETE FROM ah_bin_snapshots WHERE ts < now() - interval '90 days'")).rowCount ?? 0;
  await db.query("VACUUM"); // make the deleted space reusable (does not shrink files, but stops further growth)
  return { books, quotes, flow, sales, bins };
}

/** Tables rewritten on every poll / stats run. VACUUM FULL rewrites them compactly; each takes well under a second. */
export const HOT_TABLES = ["bazaar_latest", "bazaar_flow_hourly", "item_stats", "item_hold_stats", "ah_latest", "kv"] as const;
export async function vacuumHot(db: Db): Promise<{ tables: number; ms: number }> {
  const t0 = Date.now();
  for (const t of HOT_TABLES) await db.query(`VACUUM FULL ${t}`);
  return { tables: HOT_TABLES.length, ms: Date.now() - t0 };
}
