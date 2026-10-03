// Background worker: polls Hypixel and keeps derived data fresh. One process; each job has its own interval and
// never overlaps itself. Intervals (seconds) can be overridden with env vars, e.g. BAZAAR_EVERY=60.
import {
  ORIGIN, backfillEpisodes, fetchBazaarIfChanged, pruneDetail, vacuumHot, computeAuctionStats, computeHoldStats, computeEventImpact, computeStats, fetchBazaar, ingestActiveAuctions, ingestBazaar,
  ingestElection, ingestEndedAuctions, ingestItems, migrate, syncNeuRecipes, type Db,
} from "@bc/server-core";
import { TopTracker } from "@bc/shared";

const env = (k: string, d: number) => Number(process.env[k] ?? d);
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

interface Job { name: string; everyS: number; run: () => Promise<unknown>; busy?: boolean; last?: number }

/** Start every scanner job on `db`. Returns a function that stops the timers. */
export async function startWorker(db: Db): Promise<() => void> {
const tracker = new TopTracker(); // follows the top of every order book between polls (time-on-top episodes)
let backfilled = false;
const jobs: Job[] = [
  { name: "bazaar", everyS: env("BAZAAR_EVERY", 20), run: async () => { const d = await fetchBazaarIfChanged(); return d ? ingestBazaar(db, d, ORIGIN.POLL, null, tracker) : { status: "unchanged" }; } },
  // the endpoint lists about the last minute of sales: polling every 60 s lost ~14% of them to timing drift (measured
  // 2026-10-03 against a second collector); every 30 s with If-Modified-Since costs nothing when it has not changed
  { name: "auctions_ended", everyS: env("AUCTIONS_ENDED_EVERY", 30), run: () => ingestEndedAuctions(db) },
  // the full auction scan is ~60 MB; lowest-BIN prices only feed the optional auction-house outputs, so every 30 min
  { name: "auctions_active", everyS: env("AUCTIONS_ACTIVE_EVERY", 1800), run: () => ingestActiveAuctions(db) },
  { name: "election", everyS: env("ELECTION_EVERY", 3600), run: () => ingestElection(db) },
  { name: "items", everyS: env("ITEMS_EVERY", 86400), run: () => ingestItems(db) },
  { name: "neu_recipes", everyS: env("NEU_EVERY", 21600), run: () => syncNeuRecipes(db) },
  { name: "stats", everyS: env("STATS_EVERY", 300), run: async () => ({ items: await computeStats(db, env("CALC_DAYS", 14)), ah: await computeAuctionStats(db) }) },
  { name: "hold_stats", everyS: env("HOLD_STATS_EVERY", 600), run: async () => {
    // first start: rebuild the last day of episodes from stored order books, once
    const bf = backfilled ? null : await backfillEpisodes(db);
    backfilled = true;
    return { backfill: bf, ...(await computeHoldStats(db)) };
  } },
  { name: "retention", everyS: env("RETENTION_EVERY", 6 * 3600), run: () => pruneDetail(db) },
  { name: "vacuum", everyS: env("VACUUM_EVERY", 3600), run: () => vacuumHot(db) },
  { name: "event_impact", everyS: env("EVENT_IMPACT_EVERY", 86400), run: () => computeEventImpact(db) },
];

async function tick(job: Job) {
  if (job.busy) return;
  job.busy = true;
  const started = Date.now();
  try {
    const res = await job.run();
    log(`[${job.name}] ok in ${Date.now() - started} ms`, JSON.stringify(res));
  } catch (e) {
    log(`[${job.name}] failed:`, (e as Error).message);
  } finally {
    job.busy = false;
    job.last = Date.now();
  }
}

const applied = await migrate(db);
if (applied.length) log("applied migrations", applied);
const timers = jobs.map(job => {
  void tick(job);
  return setInterval(() => void tick(job), job.everyS * 1000);
});
log("scanner started", jobs.map(j => `${j.name}/${j.everyS}s`).join(", "));
return () => timers.forEach(clearInterval);
}
