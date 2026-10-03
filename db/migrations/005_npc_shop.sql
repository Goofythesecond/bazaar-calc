-- NPC shop prices from NEU (npc_shop recipes paid in coins only): kind 'npc', inputs [{"id":"SKYBLOCK_COIN","qty":<coins>}],
-- requirement_text holds the NPC name and island. Used only to price ingredients that the bazaar does not sell (no NPC flips).
ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_kind_check;
ALTER TABLE recipes ADD CONSTRAINT recipes_kind_check CHECK (kind IN ('crafting', 'forge', 'npc'));
