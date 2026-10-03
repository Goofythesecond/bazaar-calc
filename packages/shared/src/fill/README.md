# shared / fill

How fast orders fill, measured rather than assumed. **May use:** rules, market.

| File | What it holds |
|---|---|
| `toptrack.ts` | `TopTracker`: follows the best buy order / sell offer of every item across polls into time-on-top episodes; Kaplan-Meier survival; quota-time simulation |
| `sizing.ts` | The fill model: replays measured episodes to get units per hour, orders per hour and time on top for every order size (`curve`, `sizeFor`) |

**Change here when** the fill model changes. Prove it with the backtest (`scripts/checks/backtest.mjs`): the predicted
to real median should stay near 1.
