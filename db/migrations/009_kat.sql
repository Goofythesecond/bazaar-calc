-- Kat upgrades from NotEnoughUpdates-REPO ("katgrade": a pet one rarity up for coins, items and time).
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_kind_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_kind_check CHECK (kind IN ('crafting', 'forge', 'npc', 'kat'));
