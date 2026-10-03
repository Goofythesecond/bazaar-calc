-- Per item and hour, measured from consecutive order books (each accepted snapshot vs the previous one, if <= 150 s apart):
--   intervals       number of snapshot pairs compared
--   bid_outbid      pairs where the best buy order price went UP (someone outbid the top)
--   ask_undercut    pairs where the best sell offer price went DOWN
--   bid_removed     units that disappeared from buy-order levels at or above the new best bid (filled or cancelled)
--   ask_removed     units that disappeared from sell-offer levels at or below the new best ask
-- Removed units are an upper bound on what instant sells / buys filled at the top of the book.
CREATE TABLE IF NOT EXISTS bazaar_flow_hourly (
    item_id       text NOT NULL,
    hour          timestamptz NOT NULL,
    intervals     integer NOT NULL DEFAULT 0,
    seconds       double precision NOT NULL DEFAULT 0,
    bid_outbid    integer NOT NULL DEFAULT 0,
    ask_undercut  integer NOT NULL DEFAULT 0,
    bid_removed   bigint NOT NULL DEFAULT 0,
    ask_removed   bigint NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, hour)
);
CREATE INDEX IF NOT EXISTS bazaar_flow_hour ON bazaar_flow_hourly (hour);
