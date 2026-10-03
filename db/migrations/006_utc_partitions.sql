-- Month partitions were created with bare dates, which Postgres reads in the session timezone (UTC+6 on the PC that
-- first ran this), while the code picks the month by UTC. The October partitions therefore end at 2026-10-31 18:00 UTC
-- and a poll between 18:00 and 24:00 UTC on the last day of a month had no partition (the whole ingest failed).
-- From now on bounds are explicit UTC timestamps, and a DEFAULT partition catches anything that falls between old
-- (local-time) and new (UTC) bounds.
CREATE OR REPLACE FUNCTION bc_ensure_month_partition(parent text, month_start date) RETURNS void AS $$
DECLARE
    child text := parent || '_' || to_char(month_start, 'YYYY_MM');
BEGIN
    IF to_regclass(child) IS NULL THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)', child, parent,
                       (month_start::timestamp AT TIME ZONE 'UTC'), ((month_start + interval '1 month')::timestamp AT TIME ZONE 'UTC'));
    END IF;
END $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS bazaar_quotes_default PARTITION OF bazaar_quotes DEFAULT;
CREATE TABLE IF NOT EXISTS bazaar_books_default PARTITION OF bazaar_books DEFAULT;
CREATE TABLE IF NOT EXISTS ah_bin_snapshots_default PARTITION OF ah_bin_snapshots DEFAULT;
CREATE TABLE IF NOT EXISTS ah_sales_default PARTITION OF ah_sales DEFAULT;

-- contributors: a brand-new account no longer gets enough trust to have unchecked uploads accepted
ALTER TABLE users ALTER COLUMN trust SET DEFAULT 0.2;
