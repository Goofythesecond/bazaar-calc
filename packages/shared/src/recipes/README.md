# shared / recipes

Recipes as the calculators use them. **May use:** rules.

| File | What it holds |
|---|---|
| `types.ts` | `Recipe`: crafting table, Forge or NPC shop; inputs, output count, duration, requirements |
| `neu.ts` | Parsing NotEnoughUpdates-REPO item files into recipes; NEU id to Hypixel id (`neuToHypixelId`) |

**Change here when** NEU's item format changes. After changing the parser, bump `NEU_PARSER` in
`packages/server-core/src/ingest/reference.ts` so servers re-read the same commit.
