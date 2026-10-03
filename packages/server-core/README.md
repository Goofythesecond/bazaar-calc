# @bc/server-core

Everything the self-hosted server and the data scripts need that only runs in Node: database, Hypixel client,
ingestion, statistics, loading the market, import and export of contribution files.

**Depends on:** `@bc/shared`.

**Used by:**
- `@bc/api` and `@bc/worker`
- `scripts/data/*` (as the build's temporary database)

| File | What it does |
|---|---|
| `src/db.ts` | Postgres pool or built-in PGlite, migrations (db/migrations), monthly partitions, bulk insert. All UTC |
| `src/hypixel.ts` | HTTP client for Hypixel's key-less endpoints (If-Modified-Since: nothing downloaded when unchanged) |
| `src/ingest/bazaar.ts` | Stores one bazaar poll: change-only quotes and books, hourly keyframes, flow, time-on-top episodes |
| `src/ingest/auctions.ts` | Active-auction lowest BINs (complete scans only) and anonymous sale prices |
| `src/ingest/reference.ts` | Items and elections (Hypixel), recipes (NotEnoughUpdates-REPO) |
| `src/stats.ts` | Per-item statistics: medians, competition, flow, mass delists, auction medians, event impact (`now` is a parameter, so the site build can compute them as of the newest data) |
| `src/hold.ts` | Time-on-top episodes in the database and their per-item summaries |
| `src/market.ts` | Loads the calculator's market, recipes, mayors and events from the database |
| `src/contrib.ts` | Contribution files to and from the database (`importDataFiles`, `exportDataFiles`), with overlap handling |
| `src/retention.ts` | Thins old order books and quotes and keeps the database small |
| `src/index.ts` | The package's public API |

Tests: `src/flow.test.ts`, and `src/integration.test.ts` (schema and ingestion on PGlite).
