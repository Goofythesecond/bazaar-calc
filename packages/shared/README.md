# @bc/shared

All calculations, in plain TypeScript, with **one implementation** for every place they run:
- the self-hosted server (`@bc/api`, `@bc/worker`)
- the static website (in a Web Worker)
- both data collectors

Runs in Node and in browsers, so there are no `node:*` imports outside tests, and zod is the only dependency.

Other packages import from `@bc/shared` only, never from files inside it.

## Modules

They are listed lowest layer first. A module may import only from modules above it, and only through their
`index.ts`. `scripts/checks/architecture.mjs` enforces this.

| Module | What it holds | May use |
|---|---|---|
| [`rules/`](src/rules) | Game rules and knowledge: bazaar, Forge, enchant combining, calendar, action timing, unlock requirements | – |
| [`market/`](src/market) | Market data types, signals (flow, typical prices, warning flags), names, book packing, assembling the market, event impact | rules |
| [`recipes/`](src/recipes) | The `Recipe` type and the NotEnoughUpdates-REPO parser | rules |
| [`fill/`](src/fill) | Time-on-top episodes and the order-sizing model built on them | rules, market |
| [`calc/`](src/calc) | Route engine, route builders (bazaar / craft / book / forge), planner | rules, market, recipes, fill |
| [`data/`](src/data) | Hypixel API shapes and checks, NBT reader, contribution data files, collector core | rules, market, fill |
| [`service/`](src/service) | What the API endpoints compute: shared by the server and the static website | rules, market, recipes, fill, calc |

`src/index.ts` re-exports every module; that is the package's public API.

## Commands

```bash
pnpm --filter @bc/shared build    # tsc to dist/ (copies rules/enchants.json)
pnpm --filter @bc/shared test     # vitest: rules, calculators on a real market snapshot, fill model, NEU parsing
```

## Tests and fixtures

Tests sit next to the code they test (`*.test.ts`). `test-data/fixture.json` is a real market snapshot plus recipes,
made by `scripts/legacy/make-fixture.mjs`.
