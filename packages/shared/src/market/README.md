# shared / market

Market data and what can be read from one item's data. **May use:** rules.

| File | What it holds |
|---|---|
| `types.ts` | `BookLevel`, `ItemMarket`, `Market`, `HoldStats` (measured time-on-top summary), `Sample` |
| `signals.ts` | Trade flow per hour (observed blended with Hypixel's 7-day rate), typical prices, warning flags (manipulation, mass delists, walls...), book price ladder |
| `names.ts` | Display names (Hypixel names, readable fallbacks for books and tags) |
| `book.ts` | Packing order books into bytes (`sbbook-v1`) for storage |
| `assemble.ts` | `assembleMarket`: builds the calculator's market from live quotes + statistics, the same way on the server and in the browser |
| `event-impact.ts` | How prices moved during past runs of each event, and the outlook for upcoming ones |

**Change here when** you add a flag or change how flow or a typical price is derived. Explain each flag in
`FLAG_TEXT` and show its evidence in `flagWhy`.
