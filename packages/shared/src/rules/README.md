# shared / rules

Game rules and fixed knowledge. **Layer 0:** imports nothing else from this package.

| File | What it holds |
|---|---|
| `bazaar.ts` | Order slots, tax by Bazaar Flipper level, order caps, the daily bazaar limit and how actions count toward it |
| `auction-house.ts` | Auction House BIN fees: creation fee by price bracket, claim tax above 1M (x4 under Derpy), `ahBinNet` |
| `fusion.ts` | Attribute-shard fusion: input amounts, what the Fusion Machine offers for two shards (Chameleon, special, ID fusion, the 3-result cut), every pair that makes each shard (data in `fusion.json`, from the wiki, CC BY-NC-SA 3.0) |
| `forge.ts` | Forge slots by HotM tier, Quick Forge, forge durations |
| `enchants.ts` | Enchanted-book combining caps and XP costs (data in `enchants.json`, from the wiki, CC BY-NC-SA 3.0) |
| `calendar.ts` | SkyBlock calendar, recurring events, mayor terms |
| `timing.ts` | How long each bazaar / anvil / forge action takes (ping + server tick + clicks) |
| `mayor-perks.ts` | Mayor perks that change the calculator (Cole's Molten Forge, Diaz's Volume Trading / quad taxes, Diaz's Shopping Spree) and which are active in a term |
| `requirements.ts` | Unlock requirements (collections, HotM, slayer, reputation, Enchanting): parsing and checking; the `Profile` type |

**Change here when** a game rule changes. Every constant needs its source (research/RESEARCH.md or a comment).
Calculations that use a rule belong in `calc/` or `market/`, not here.
