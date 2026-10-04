-- Items that cannot stack: a bazaar order holds at most 256 of them instead of 71,680 (Hypixel's items API flag).
ALTER TABLE items ADD COLUMN IF NOT EXISTS unstackable boolean NOT NULL DEFAULT false;
