-- Burstiness of each time-on-top episode: how many of its polls saw units trade against it (NULL in older rows).
-- Few active polls in a long episode means trades came in bursts, so fill times vary more than the average suggests.
ALTER TABLE bazaar_top_episodes ADD COLUMN IF NOT EXISTS active integer;
