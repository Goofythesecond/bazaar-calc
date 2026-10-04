# data/paper

Paper-trading records of the always-on scanner (`packages/collector/src/scanner.ts`), one file per scanner:
`<GitHub login>.json`, replaced on every push (every 30 minutes). The website's Track record page shows it.

Each file holds `{ name, updatedAt, settings, summary, state }`:
- `summary`: closed and open trades, realized vs expected profit, win rate, time per trade (`paperSummary`)
- `state.trades`: the last 200 virtual trades (fill/paper.ts in `@bc/shared`): the calculator's own top bazaar picks,
  run as virtual orders that fill only from real trades while they are the best price

These are simulations, not contributed market data; they contain nothing about players.
