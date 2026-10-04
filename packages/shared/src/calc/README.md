# shared / calc

The calculators. **May use:** rules, market, recipes, fill.

| File | What it holds |
|---|---|
| `engine.ts` | `evaluate`: one route (buy legs, steps, sell leg) to profit, batch size, order sizes, the limiting resource (coins, daily limit, clicking, forge slots, Kat, supply / demand) and the full working |
| `routes.ts` | Route builders: `bazaarFlips`, `craftFlips`, `bookFlips`, `forgeFlips`, plus the shared search for the cheapest way to get an input |
| `npc-flips.ts` | `npcFlips`: bazaar to NPC (sell to an NPC merchant, no tax, 500M coins a day) and NPC to bazaar (buy from a merchant, 640 a day per item, 6,400 in a Shopping Spree) |
| `kat-flips.ts` | `katFlips`: buy a pet on the auction house, have Kat raise it one rarity (NotEnoughUpdates-REPO `katgrade` recipes), sell it there; lowest BINs of each rarity, AH fees, Kat's fee, one pet at a time |
| `fusion-flips.ts` | `fusionFlips`: buy two kinds of shards on the bazaar, fuse, sell the result; per shard the cheapest pair the machine is sure to offer; Foraging 12 |
| `confidence.ts` | `routeConfidence`: how much to trust a route's numbers (fill basis, price history, flow hours, warnings, statistics age) as a score, a level and the reasons |
| `planner.ts` | `plan`: the mix of routes that earns the most over your play time within order slots, the daily limit, clicking time, forge slots and coins: each order route one trade at a time or buying while selling (whichever earns more), confidence-weighted, up to four passes that make the budget that ran out dearer; tiny picks dropped; says what limits the plan |

**Change here when** a flip type or the maths changes. Every route stays listed (losing ones too). A recipe that
can't be priced goes to `ctx.skipped` with its reason. Order sizes respect the daily limit and the 71,680 cap.
Verify with `pnpm --filter @bc/shared test`, and with `scripts/checks/audit.mjs` on a running server.
