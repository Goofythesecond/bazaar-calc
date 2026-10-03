-- Real instant trades per item and hour, from Hypixel's 7-day counters (buyMovingWeek / sellMovingWeek). Each counter
-- rises with every trade and falls in bulk when week-old trades expire (about every 30 min; measured 2026-10-03: 98% of
-- counter changes were rises). Between two polls <= 150 s apart in which neither counter fell, the rise IS the trades.
--   trade_intervals / trade_seconds   poll pairs (and their seconds) in which trades could be measured
--   bid_trades    units instant-SOLD (they filled buy orders, best price first)
--   ask_trades    units instant-BOUGHT (they filled sell offers, best price first)
-- Pairs in which a counter fell (an expiry batch) are left out: the trades in them are unknown.
ALTER TABLE bazaar_flow_hourly
  ADD COLUMN IF NOT EXISTS trade_intervals integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trade_seconds double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bid_trades bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ask_trades bigint NOT NULL DEFAULT 0;
