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
| `src/routes/calc.ts` | `/api/v1/calc/*`: wraps `calcResponse` / `planResponse` from `@bc/shared` |
| `src/routes/fill.ts` | `/api/v1/bazaar/{id}/fill`: wraps `fillReport` |
| `src/routes/public.ts` | Items, history, books, auctions, mayors, events, outlook, rules, status |
| `src/routes/contribute.ts` | Uploads with an API key (raw Hypixel responses, cross-checked) |
| `src/auth.ts` | Discord OAuth2, sessions, API keys |
| `src/openapi.ts` | The OpenAPI description |
| `src/migrate.ts` | `pnpm db:migrate` |

Calculation logic does not belong here: put it in `@bc/shared` (usually `service/`) so the static website gets it too.
