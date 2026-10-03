# shared / calc

The calculators. **May use:** rules, market, recipes, fill.

| File | What it holds |
|---|---|
| `engine.ts` | `evaluate`: one route (buy legs, steps, sell leg) to profit, batch size, order sizes, the limiting resource (coins, daily limit, clicking, forge slots, supply / demand) and the full working |
| `routes.ts` | Route builders: `bazaarFlips`, `craftFlips`, `bookFlips`, `forgeFlips`, plus the shared search for the cheapest way to get an input |
| `planner.ts` | `plan`: the mix of routes that earns the most per day within slots, the daily limit, clicking time and coins |

**Change here when** a flip type or the maths changes. Every route stays listed (losing ones too). A recipe that
can't be priced goes to `ctx.skipped` with its reason. Order sizes respect the daily limit and the 71,680 cap.
Verify with `pnpm --filter @bc/shared test`, and with `scripts/checks/audit.mjs` on a running server.
