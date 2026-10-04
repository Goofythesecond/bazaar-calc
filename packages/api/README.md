# @bc/api

The self-hosted server: Fastify REST API (`/api/v1/*`, OpenAPI at `/api/openapi.json`), Discord login, API keys,
contributor uploads, and serving the built website.

**Depends on:** `@bc/shared`, `@bc/server-core`. `src/all.ts` also uses `@bc/worker`, to run the scanner in the same
process.

| File | What it does |
|---|---|
| `src/index.ts` | Start the API alone |
| `src/all.ts` | Start scanner + API in one process (needed with the built-in PGlite database) |
| `src/server.ts` | Builds the Fastify app: compression, cookies, rate limits, routes, static files |
| `src/env.ts` | Environment settings |
| `src/state.ts` | In-memory market, recipes and events, refreshed every 30 s; caches calculator results |
| `src/routes/calc.ts` | `/api/v1/calc/*`: wraps `calcResponse` / `planResponse` from `@bc/shared`; `POST /api/v1/alerts/check` (`alertCheckResponse`) |
| `src/routes/fill.ts` | `/api/v1/bazaar/{id}/fill`: wraps `fillReport` |
| `src/routes/public.ts` | Items, history, order books, auctions, mayors, events, outlook, dips, rules (with the active mayor perks), perks, order check (`POST /api/v1/orders/check`), status |
| `src/jobs.ts` | Paper trading around the clock (`GET /api/v1/paper`) and Discord alerts from `ALERTS_FILE` |
| `src/routes/contribute.ts` | Uploads with an API key (raw Hypixel responses, cross-checked) |
| `src/auth.ts` | Discord OAuth2, sessions, API keys |
| `src/openapi.ts` | The OpenAPI description |
| `src/migrate.ts` | `pnpm db:migrate` |

**Alerts without a browser:** on the website's Alerts page, "Download alerts.json" saves a JSON file
(`{ discordWebhook, rules: { minCoinsH, minMarginPct, kinds, noWarnings, minConfidence }, settings, profile }`). Start
the server with `ALERTS_FILE=/path/to/that.json` and it sends a Discord message for every route that newly meets the
rules, checked after each scan. The first check after a start only records what already qualifies. Paper trading runs
with the same settings (or the defaults) and keeps its record in the database.

Calculation logic does not belong here: put it in `@bc/shared` (usually `service/`) so the static website gets it too.
