# @bc/worker

The scanner: background jobs that poll Hypixel and keep the derived data fresh.

**Depends on:** `@bc/shared`, `@bc/server-core`.

| File | What it does |
|---|---|
| `src/jobs.ts` | `startWorker`: every job with its interval (overridable with env vars, e.g. `BAZAAR_EVERY=60`):<br>• bazaar every 20 s<br>• ended auctions every 30 s<br>• lowest BINs every 30 min<br>• election every hour<br>• items daily<br>• NEU recipes every 6 h<br>• stats every 5 min<br>• time-on-top stats every 10 min<br>• retention every 6 h<br>• vacuum every hour<br>• event impact daily |
| `src/index.ts` | Start the worker alone |

A job never overlaps itself, and failures are logged and retried at the next interval.
