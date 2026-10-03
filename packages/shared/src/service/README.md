# shared / service

What the API endpoints compute, independent of where the data comes from. **May use:** rules, market, recipes, fill,
calc.

| File | What it holds |
|---|---|
| `endpoints.ts` | Input schemas (settings, profile, filters; clamped), `applyFilters`, `calcResponse`, `planResponse`, `fillReport`, `outlookResponse`, `requirementsCatalog` |

**Used by:**
- the API server (`packages/api/src/routes`)
- the static website (`packages/web/src/static/backend.ts`)

**Change here when** an endpoint's result changes, and both sites follow. A new endpoint also needs a route in
`packages/api` and a branch in the static backend.
