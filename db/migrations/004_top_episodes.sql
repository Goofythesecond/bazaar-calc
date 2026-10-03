-- Time-on-top episodes (see packages/shared/src/toptrack.ts). One row per freshly posted best price, from the poll
-- that first showed it until the poll that showed it beaten / gone (or the data stopped: end_reason 'c').
--   side         'b' best buy order, 'a' best sell offer
--   dur_s        midpoint estimate of seconds on top; lo_s / hi_s are the bounds the 60 s polls allow
--   flow         units that left the book at prices this order was ahead of while it was on top (fills + cancels)
--   removed      units removed at exactly this price
--   end_reason   'o' outbid / undercut, 'g' level gone and the best got worse (filled or cancelled), 'c' cut
-- Kept for a few days; item_hold_stats holds the per-item summary the calculator uses.
CREATE TABLE IF NOT EXISTS bazaar_top_episodes (
    item_id       text NOT NULL,
    side          char(1) NOT NULL,
    start_ts      timestamptz NOT NULL,
    end_ts        timestamptz NOT NULL,
    price_cents   bigint NOT NULL,
    dur_s         real NOT NULL,
    lo_s          real NOT NULL,
    hi_s          real NOT NULL,
    polls         integer NOT NULL,
    flow          double precision NOT NULL,
    removed       double precision NOT NULL,
    start_amount  bigint NOT NULL,
    start_orders  integer NOT NULL,
    end_reason    char(1) NOT NULL
);
CREATE INDEX IF NOT EXISTS bazaar_top_episodes_item ON bazaar_top_episodes (item_id, side, end_ts);
CREATE INDEX IF NOT EXISTS bazaar_top_episodes_end ON bazaar_top_episodes (end_ts);

CREATE TABLE IF NOT EXISTS item_hold_stats (
    item_id      text NOT NULL,
    side         char(1) NOT NULL,
    computed_at  timestamptz NOT NULL,
    data         jsonb NOT NULL,
    PRIMARY KEY (item_id, side)
);
