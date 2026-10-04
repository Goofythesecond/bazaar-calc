# Research notes (verified 2026-10-02)

Every rule the calculator uses is listed here with where it came from. "Confirmed" = stated by the source; "community" = derived by players / mods, not stated by Hypixel; "assumption" = our model, exposed as a user setting.

## Data sources we are allowed to use

| Source | Licence / terms | How we use it |
|---|---|---|
| Hypixel Public API (`/v2/skyblock/bazaar`, `/auctions`, `/auctions_ended`, `/resources/skyblock/items`, `/resources/skyblock/election`) | [API policy](https://developer.hypixel.net/policies/) (updated 2026-09-30): endpoints without a key "exist to allow more continuous polling of that data"; must state the site is not affiliated with or endorsed by Hypixel; no Hypixel branding; monetising needs a Production app (we are free, no ads). Do not build histories of *player* data. | All market data. Auction seller/buyer UUIDs are dropped at ingestion. |
| Internet Archive copies of the same Hypixel endpoints | Archive access is "for scholarship and research purposes only"; content stays Hypixel's. | Migrated as historical Hypixel data (owner's choice); labelled `origin = wayback`. |
| NotEnoughUpdates-REPO | **MIT** (© 2020 Moulberry). Keep the copyright notice. | Crafting recipes, forge recipes + durations, recipe requirements (`crafttext`), Quick Forge formula. |
| hypixelskyblock.minecraft.wiki | **CC BY-NC-SA 3.0**. Non-commercial, attribution, share-alike. | Enchantment combining caps, enchanting requirements, apply/combine XP costs, Forge and Bazaar rules. Facts only, attributed in NOTICE. |
| Coflnet, skykings, skyblock.bz | Not usable for publishing (Coflnet: personal use only; others: no terms / gated). | **Not used.** The migration script skips them. |

## Bazaar (confirmed, [wiki: Bazaar](https://hypixelskyblock.minecraft.wiki/w/Bazaar))
- Orders open at once: **14**, +7 per Bazaar Flipper level (max 2 levels) → **28**.
- Tax on all sales: **1.25%**, −0.125% per Bazaar Flipper level → **1%**.
- Max units per buy order: **71,680** (1,120 stacks); **256** for unstackable items.
- Max **1B coins** worth of items on sell offer at once.
- Instant buy capped by inventory space: 2,240 for most items (560 for 16-stack items, 35 unstackable, 71,680 essence); quoted at +4% and refunded down.
- Orders expire after **7 days**. A fully filled buy order can be **flipped** to a sell offer.
- Preset prices: buy order = top, top + 0.1, or 5% of spread; sell offer = top, top − 0.1, or 10% of spread; custom up to 500M/unit.

## Bazaar daily limit (community, two open-source mods agree)
- [SkyHanni `BazaarLimitTracker.kt`](https://github.com/hannibal002/SkyHanni/blob/beta/src/main/java/at/hannibal2/skyhanni/features/inventory/bazaar/BazaarLimitTracker.kt) and its repo constant `constants/Bazaar.json` (`daily_limit: 15000000000`, `cap_orders_at_integer_limit: true`).
- [Bazaar Utils `BazaarLimitsVisualizer.java` / `BazaarChatEventHandler.java`](https://github.com/mkram17/Bazaar-Utils).
- Limit **15,000,000,000 coins per day**, reset **00:00 UTC**.
- Counts: **instant buy**, **instant sell (pre-tax)**, **buy order created**, **sell offer created** (full order value at creation). Does **not** count: order fills, claims, *Order Flipped*.
- Each single action counts at most **2,147,483,647** coins (Hypixel ignores the excess above the 32-bit integer limit).
- Forum reports of 10B and 32B exist (unconfirmed); the value is a user setting, default 15B.
- Consequence for flipping: every relist (cancel + new order) counts the order value **again**.

## Bazaar menus (from SkyHanni inventory-title patterns)
`Bazaar ➜ <item>` → `How many do you want?` → `How much do you want to pay?` → `Confirm Buy Order`;
sell: `At what price are you selling?` → `Confirm Sell Offer`; instant buy: `How many do you want?` → `Confirm Instant Buy`;
orders: `Your Bazaar Orders` → `Order options` (cancel / flip). Chat confirmations: `Bought`, `Sold`, `Buy Order Setup!`, `Sell Offer Setup!`, `Order Flipped!`.

## Action timing model (assumption, user-tunable)
No source publishes action times. We model each GUI step as `ping + server_tick(50 ms) + your click delay`, and typing a custom amount/price in the sign as a separate time. Step counts per action come from the menus above (see `packages/shared/src/rules/timing.ts`). Contributors running the mod can upload real timings to replace the defaults.

## Enchanted books ([wiki: Enchantments](https://hypixelskyblock.minecraft.wiki/w/Enchantments), [Enchanted Book](https://hypixelskyblock.minecraft.wiki/w/Enchanted_Book), [Anvil](https://hypixelskyblock.minecraft.wiki/w/Anvil))
- Two books of the same enchant and level combine into the next level in an anvil, **free (0 XP)** and without anvil uses — *except* enchants with a "Cost to Combine" table (e.g. Flowstate: 50/100/150 levels).
- High-level books (usually VI+) **cannot** be made by combining (e.g. Luck VI, Protection VI); they come from Experiments, Dark Auction, Tomioka, visitors, etc.
- Per-enchant combining cap comes from each page's sentence "can be combined on an Anvil up to X N" and its `AnvilSB` recipes. Example: **Dedication** combines to **III**; **IV** only from the Librarian / Ravenous Rhino visitors.
- Pages without that sentence (vanilla-style enchants: Efficiency, Critical, Protections, Fortune, Harvesting, ...): the [Enchanted Book](https://hypixelskyblock.minecraft.wiki/w/Enchanted_Book) page says books whose level *cannot be obtained from an Enchantment Table* cannot be combined, so the cap is the highest level the page's "Obtaining" table lists from the Enchantment Table (`research/wiki_table_caps.py` → `wiki_table_caps.json`, `cap_source: enchantment_table_levels`). Prosperity's cap (V) comes from its stats table ("Combining Prosperity I books").
- 2026-10-02: 135 enchants combinable, 9 `noCombine` (level up by use: Champion, Compact, Cultivating, Expertise, Hecatomb, ...), 12 unknown (e.g. Counter-Strike, Quantum: only drops listed) and **never used**. Fixed wiki-infobox id slips: Flame's page carries Fire Aspect's id; Bank, Depth Strider, Frost Walker, Quantum ids normalised to the live bazaar ids. The live bazaar (777 books, 155 enchants) is the truth for which levels trade; the wiki's `EnchantmentBazaarStats` minimums are out of date (e.g. Blast Protection I–V do trade).
- Applying a book needs an Enchanting skill level (`req_enchanting_level`) and XP levels (`cost` table) — shown as requirements.

## Forge ([wiki: The Forge](https://hypixelskyblock.minecraft.wiki/w/The_Forge), NEU `hotmlayout.json`)
- Requires **HotM 2**. Slots: **2 at HotM 2, +1 per HotM tier up to HotM 7** (7 slots).
- Time reductions stack additively: **Quick Forge** = `10 + 0.5 × level` % for levels 1–19, **30%** at level 20; **Cole's Molten Forge** −25% for processes started during his term; Gemstone Gauntlet Kinetic −0.5 s per Perfect Gemstone kill (not modelled).
- Processes cannot be cancelled.
- 120 forge recipes with durations (seconds) and requirements (`Requires: HotM N`) from NEU.

## Auctions (Hypixel API, measured)
- `/v2/skyblock/auctions?page=N`: 46 pages × ~2.4 MB, 1,000 auctions each, cached 60 s.
- `/v2/skyblock/auctions_ended`: sales of the last 60 s (~100 rows).
- `item_bytes` = base64 gzip NBT; item id at `ExtraAttributes.id`, books' enchant at `ExtraAttributes.enchantments`.
- We store per-item lowest BIN / counts and ended-sale prices only (no player ids).

## Flip maths: what other tools do, and what we measure instead (2026-10-02)

Open-source formulas, read from their code:
- **BazaarNotifier** (`SuggestionCalculator.calculateEP`): coins/min = `B·S / (10080·(B+S)) · (sell·0.99 − buy)` with B, S = buyMovingWeek, sellMovingWeek. The harmonic mean models buy-then-sell *in sequence*; top-of-book prices; 1% tax on the sale.
- **Pitnon/skyblock-bz-flip** (`backend/server.js`): coins/h = `margin · min(buyMovingWeek, sellMovingWeek) / 168`, filter min > 10/h.
- **Coflnet guide**: `(sell − buy) · sales per week / 168`; it says fees apply on both sides — the wiki says tax is on sales only, we follow the wiki.
- **Forum score**: `profit per item · (instasells + instabuys per minute) / 100`; its own thread notes it ignores order competition and inventory.
None of them model competition (how long you stay the best price), order size, relisting, or the daily limit.

What we measure (`packages/shared/src/fill/toptrack.ts`, recorded on every poll, table `bazaar_top_episodes`):
- **Episode** = a freshly posted best price (beats the previous best) from the poll that first shows it to the poll that shows it beaten (`outbid`), gone with a worse best (`gone`: filled or cancelled) or a polling gap (`cut`, censored). Duration = midpoint of the interval the polls allow (60 s polls until 2026-10-02, 20 s since: Hypixel refreshes the bazaar about every 20 s), bounds kept. Survival by Kaplan-Meier.
- **Flow on top** = units that left the book at prices the top order was ahead of while it was on top. Polls cannot separate fills from cancels, so the long-run rate is scaled to the item's measured trade rate (min of 7-day ÷ 168 and observed removals).
- First 5.4 h replay (2026-10-01, 52,483 episodes, 897 item-sides with ≥ 20): median time on top **~2 min** (both sides, many within the 60 s poll resolution); **43%** of new best buy orders and **38%** of new best sell offers are beaten before the next poll; at a 5-minute check interval the median item gives you the top **~48–51%** of the time; flow-on-top vs Hypixel 7-day rate: median 1.4× (bids, fills + cancels) / 0.94× (asks) — hence the scaling.

Order sizing (`packages/shared/src/fill/sizing.ts`): each measured episode is one cycle — post Q on top, hold T, fill at the episode's flow, notice at your next look, relist (counts Q·price toward the daily limit again). Units/h, orders/h and limit/h follow for every size; a route uses the *smallest* size per order leg that still moves the units/h the route runs at (bigger orders do not fill faster). Budgets (daily limit spread over your hours, clicking time, coins) are solved together for the route's rate. Bazaar flips can turn a fully filled buy order into the sell offer with **Flip Order**, which does not count toward the limit.

Known limits: holds shorter than one poll (~20 s, the API refresh rate) cannot be seen precisely; our own order would change competitors' behaviour; cancels look like fills (handled by scaling, not removed).

## Cross-check against skyblock.bz (2026-10-02, same minute, `api.skyblock.bz/api/flips` + `/api/crafts`)
- Their prices equal Hypixel's live top of book (median diff 0%, 99–100% within 1%); their volumes are exactly Hypixel 7-day ÷ 168.
- Their formulas, reproduced on every row: flips `(best sell offer × 0.9775 − best buy order) × min(instabuys/h, instasells/h)` (800/800); crafts `(product × 0.9775 − buy-order cost of ingredients) × bottleneck` (142/142). 0.9775 = a 2.25% deduction; the wiki's bazaar tax is 1.25% (1% at Bazaar Flipper II).
- They assume you get 100% of the 7-day volume: no competition / time on top, no order size, no coins, no daily limit, no crafting or clicking time (e.g. 26,000 Enchanted Coal crafted per hour).
- Their errors found: ingredients they cannot price count as 0 coins (Enchanted Ice, Packed Ice, Enchanted Netherrack: "cost 0"); Enchanted Brown/Red Mushroom Block priced from an old recipe (~1.4k–7k) while NEU and the market (block 250.8k ≈ 160 × Enchanted Brown Mushroom 1,562) say 160 Enchanted Mushrooms.
- Our bugs it exposed (fixed): NEU damage-value ids (`INK_SACK-4`, `LOG-3`) did not match bazaar ids (`INK_SACK:4`, `LOG:3`), dropping ~20 craft recipes; single routes only got 1/7 of the user's coins; sub-crafting was chosen on price alone even when it meant 160 extra crafts per unit. NPC shop prices (NEU `npc_shop`, coins only) now price ingredients the bazaar does not sell at all; bazaar items were never bought from NPCs then (NPC flips came on 2026-10-03, below).
- After the fixes: every one of their 797 flips and all but 6 of their crafts are in our list (the 6: their 0-cost ones, Hot Stuff, Enchanted Carrot on a Stick), profitable/not agrees on 770/797 flips and 135/135 shared crafts, our coins/h is 0.77× theirs for flips and 0.67× for crafts (median) because of time on top, the 1.25% tax and your own limits; we list 56 clean profitable crafts they do not.

## Mayor perks and NPC shops (2026-10-03)
- **Derpy "QUAD TAXES!!!"**: "Pay 4x the normal amount of taxes!", bazaar tax included since 2024-07-02 ([wiki: Derpy](https://hypixelskyblock.minecraft.wiki/w/Derpy)); Bazaar Utils applies the same x4. `taxRate(level, quadTaxes)`.
- **Diaz "Shopping Spree"**: NPC daily buy limits x10 ([wiki: Diaz](https://hypixelskyblock.minecraft.wiki/w/Diaz), [Shop](https://hypixelskyblock.minecraft.wiki/w/Shop)).
- **Cole "Molten Forge"**: forge times -25% ([wiki: Cole](https://hypixelskyblock.minecraft.wiki/w/Cole)).
- A perk counts when the current mayor has it or it is the minister's perk, read by name from Hypixel's election data (`rules/mayor-perks.ts`). With no perk active every result is unchanged (checked with `scripts/checks/outputs.mjs`).
- **NPC shops** ([wiki: Shop](https://hypixelskyblock.minecraft.wiki/w/Shop)): most merchants sell at most 640 of an item per profile per day (6,400 in a Shopping Spree), reset 00:00 UTC. Selling to NPCs pays no bazaar tax and earns at most 500,000,000 coins per profile per day since 2025-10-15 (200M before). Selling prices come from Hypixel's `/v2/resources/skyblock/items` (`npc_sell_price`); merchant prices from NotEnoughUpdates-REPO (`npc_shop` recipes paid in coins only, in the NPC's file, e.g. `items/JAKE_NPC.json`: Lucky Dice for 1,000,000).
- Hand-checked NPC flips: Enchanted Seeds (buy order 440.9 → NPC 480); True Protection I (buy from Nyko for 900k → sell offer 1,155,108.4, 1,140,669.54 after tax).

## Real trades from Hypixel's 7-day counters (measured 2026-10-03)
- `quick_status.sellMovingWeek` / `buyMovingWeek` rise between two polls by the units instant-sold (filling buy orders) and instant-bought (filling sell offers). They also drop in bulk when week-old trades expire, about every 30 minutes; in such a pair of polls the trades are unknown and left out (`counterTrades` returns null).
- Stored per item and hour (`bazaar_flow_hourly`: `trade_intervals`, `trade_seconds`, `bid_trades`, `ask_trades`, migration 007) and in contribution files (optional columns). Statistics use them once an item has at least 1 hour of measured trades (`flowBasis: "trades"`), and mass-delist checks count them as exact with at least 3 hours.
- Backtest on 14.2 hours of stored books (`scripts/checks/backtest.mjs`), predicted / realized median:

  | Order size | Book-change model | Trades model |
  |---|---|---|
  | 64 | 1.02 | 0.96 |
  | 640 | 1.07 | 0.99 |
  | 71,680 | 0.88 | 0.86 |

  Time on top is predicted about 12 points low in both, and estimated (too few episodes) sides fit poorly: hence the confidence factor 0.6 for estimated fill times.

## Dips (2026-10-03)
- A dip is a cheapest sell offer at least X% below the **lower** of the 24 h and 7-day medians. Using the 24 h median alone called Shard Sea Serpent "82% below" (ask 179,988; 24 h median 999,994 from a recent ~1M level; 7-day median 189,995).
- Each dip says whether it is new: the cheapest offer about an hour earlier (latest quote 1–3 h back) was still above the threshold. Example of a lasting one: Ultimate Wisdom III, 780k for days, 13M for a few hours, then 1M again: both medians (from 16 and 21 hours) sat at 7–8M, so it showed as 86% below but "already low".
- Hand-checked new ones: Shard Tiamat ~180k for two days, then 110k with 363 units bought within 100 s; Magma Urchin from 18.47M to 16.13M.


## Always-on scanner, item list, paper trading (measured 2026-10-04)
- **Hypixel's item list leaves out bazaar products:** `/v2/resources/skyblock/items` has no `ENCHANTMENT_*` ids (all
  enchanted books). The website's item list had 1 of them, so books could not be found; every product seen in the bazaar
  now gets an item row (778 books in the rebuilt list). The list has 13 "Enchanted Book Bundle" items with the same
  name; names now say which enchant (e.g. "Enchanted Book Bundle (Power)").
- **Scanner memory** (15 minutes, two BIN scans of all pages at 2 pages at a time, bazaar every 20 s): peak RSS 360 MB
  with Node's default heap, 329 MB with `--max-old-space-size=192` (Node 24, Linux). Keeping every auction page until
  the end of a scan peaked at 431 MB.
- **Splitting data into files** (every 30 min) loses nothing on import: 12 real polls recorded as one file and as three
  files imported to identical flow, trades and time-on-top episodes (1,258), also with the polls shifted to straddle a UTC hour. Each file
  repeats its own hourly close, so the database has more quote rows; statistics use the last per hour.
- **Paper trading, first results** (self-hosted server, 2026-10-03/04, default settings): 3 closed trades, all
  profitable, 16.7M realized vs 36.6M expected (46%), 8.3 h per trade vs 1.3 h predicted (including about 4 hours with
  the PC off). The fill model is optimistic for the illiquid high-margin items these picks favour; more trades are
  needed before changing it.
