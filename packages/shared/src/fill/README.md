# shared / fill

How fast orders fill, measured rather than assumed. **May use:** rules, market.

| File | What it holds |
|---|---|
| `toptrack.ts` | `TopTracker`: follows the best buy order / sell offer of every item across polls into time-on-top episodes; Kaplan-Meier survival; quota-time simulation |
| `order-tracker.ts` | `trackOrder` / `updateOrder`: follows one order you placed in game through each snapshot (on top or behind, units ahead of you in the queue, filled so far, certain once the best price moves past yours); expiry after 7 days, partial claims (`claimOrder`), bought-but-unlisted orders (`unsoldBuys`, the sell-first reminder) |
| `calibration.ts` | Fill-speed correction from paper trades: actual vs predicted buy and sell time per side (geometric mean, pulled toward the model while trades are few) and per item; `fillFactor` |
| `paper.ts` | Paper trading: places virtual orders on the calculator's top picks and fills them from the market's real trades, to measure how the predictions hold up |
| `sizing.ts` | The fill model: replays measured episodes to get units per hour, orders per hour and time on top for every order size (`curve`, `sizeFor`) |

**Change here when** the fill model changes. Prove it with the backtest (`scripts/checks/backtest.mjs`): the predicted
to real median should stay near 1.
