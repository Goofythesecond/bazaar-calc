-- bazaar-calc schema. Only Hypixel-origin data is stored.
-- Prices are BIGINT centicoins (coins * 100). Times are timestamptz (UTC).
-- origin: 1 = our Hypixel poll, 2 = contributor upload, 6 = Internet Archive copy of the Hypixel API.

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());

-- ------------------------------------------------------------------ reference data
CREATE TABLE items (
    id              text PRIMARY KEY,           -- Hypixel item id, e.g. ENCHANTED_DIAMOND, ENCHANTMENT_SHARPNESS_6
    name            text,
    category        text,
    tier            text,
    material        text,
    npc_sell_price  double precision,
    on_bazaar       boolean NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Recipes from NotEnoughUpdates-REPO (MIT). inputs = [{"id": "...", "qty": n}]
CREATE TABLE recipes (
    id              bigserial PRIMARY KEY,
    output_id       text NOT NULL,
    kind            text NOT NULL CHECK (kind IN ('crafting', 'forge')),
    inputs          jsonb NOT NULL,
    output_count    double precision NOT NULL DEFAULT 1,
    duration_s      integer,                     -- forge only
    requirements    jsonb NOT NULL DEFAULT '[]', -- parsed, see packages/shared/src/requirements.ts
    requirement_text text,
    source          text NOT NULL DEFAULT 'neu',
    source_version  text,
    inputs_key      text NOT NULL,               -- normalised inputs for de-duplication
    UNIQUE (output_id, kind, inputs_key)
);
CREATE INDEX recipes_output ON recipes (output_id);

-- ------------------------------------------------------------------ bazaar
CREATE TABLE bazaar_snapshots (
    ts              timestamptz NOT NULL,        -- Hypixel lastUpdated
    origin          smallint NOT NULL,
    contributor_id  bigint,
    received_at     timestamptz NOT NULL DEFAULT now(),
    n_products      integer,
    n_changes       integer,
    keyframe        boolean NOT NULL DEFAULT false,
    PRIMARY KEY (ts)
);

-- Change-only quotes + hourly keyframes. A missing row inside an observed snapshot means "unchanged".
CREATE TABLE bazaar_quotes (
    item_id     text NOT NULL,
    ts          timestamptz NOT NULL,
    ask_top     bigint,     -- best sell offer (instant-buy price)
    bid_top     bigint,     -- best buy order (instant-sell price)
    ask_wavg    bigint,     -- Hypixel quick_status buyPrice (weighted top ~2%)
    bid_wavg    bigint,
    ask_volume  bigint,     -- units in sell offers
    bid_volume  bigint,     -- units in buy orders
    ask_orders  integer,
    bid_orders  integer,
    ibuy_week   bigint,     -- units instant-bought in the last 7 days
    isell_week  bigint,
    origin      smallint NOT NULL,
    PRIMARY KEY (item_id, ts)
) PARTITION BY RANGE (ts);

-- Order books, packed "sbbook-v1": zstd( u16 count + count * (i64 price_centicoins, i64 amount, u32 orders) ), LE.
CREATE TABLE bazaar_books (
    item_id     text NOT NULL,
    ts          timestamptz NOT NULL,
    bids        bytea,
    asks        bytea,
    origin      smallint NOT NULL,
    PRIMARY KEY (item_id, ts)
) PARTITION BY RANGE (ts);

-- Fast "now" table, rewritten on every accepted snapshot.
CREATE TABLE bazaar_latest (
    item_id     text PRIMARY KEY,
    ts          timestamptz NOT NULL,
    ask_top bigint, bid_top bigint, ask_wavg bigint, bid_wavg bigint, ask_volume bigint, bid_volume bigint,
    ask_orders integer, bid_orders integer, ibuy_week bigint, isell_week bigint,
    bids        bytea,
    asks        bytea
);

-- Monthly partitions are created on demand.
CREATE OR REPLACE FUNCTION bc_ensure_month_partition(parent text, month_start date) RETURNS void AS $$
DECLARE
    child text := parent || '_' || to_char(month_start, 'YYYY_MM');
BEGIN
    IF to_regclass(child) IS NULL THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                       child, parent, month_start, (month_start + interval '1 month')::date);
    END IF;
END $$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------ auctions (aggregates only, no player ids)
-- item_key: item id; single-enchant books use the bazaar-style id ENCHANTMENT_<NAME>_<LEVEL>; pets PET_<TYPE>_<TIER>.
CREATE TABLE ah_bin_snapshots (
    item_key        text NOT NULL,
    ts              timestamptz NOT NULL,
    lowest_bin      bigint,
    second_bin      bigint,
    bin_count       integer NOT NULL,
    auction_count   integer NOT NULL,
    origin          smallint NOT NULL,
    PRIMARY KEY (item_key, ts)
) PARTITION BY RANGE (ts);

CREATE TABLE ah_sales (
    auction_id      uuid NOT NULL,
    item_key        text NOT NULL,
    ts              timestamptz NOT NULL,
    price           bigint NOT NULL,
    bin             boolean NOT NULL,
    origin          smallint NOT NULL,
    PRIMARY KEY (auction_id, ts)
) PARTITION BY RANGE (ts);
CREATE INDEX ah_sales_item ON ah_sales (item_key, ts);

CREATE TABLE ah_latest (
    item_key        text PRIMARY KEY,
    ts              timestamptz NOT NULL,
    lowest_bin      bigint,
    second_bin      bigint,
    bin_count       integer NOT NULL,
    auction_count   integer NOT NULL,
    sales_24h       integer NOT NULL DEFAULT 0,
    median_sale_24h bigint
);

-- ------------------------------------------------------------------ mayors / elections (Hypixel election endpoint only)
CREATE TABLE election_snapshots (
    ts          timestamptz PRIMARY KEY,
    sb_year     integer,
    origin      smallint NOT NULL,
    data        jsonb NOT NULL
);

CREATE TABLE mayors (
    election_year   integer PRIMARY KEY,         -- term starts Late Spring 27 of election_year + 1
    mayor_key       text,
    mayor_name      text NOT NULL,
    start_ts        timestamptz NOT NULL,
    end_ts          timestamptz NOT NULL,
    votes           bigint,
    perks           jsonb NOT NULL DEFAULT '[]',
    minister        jsonb,
    candidates      jsonb
);

-- ------------------------------------------------------------------ computed stats (refreshed by the worker)
CREATE TABLE item_stats (
    item_id         text PRIMARY KEY,
    computed_at     timestamptz NOT NULL,
    window_days     integer NOT NULL,
    data            jsonb NOT NULL                -- medians, competition, sparkline, event impact
);

-- ------------------------------------------------------------------ users, keys, contributions
CREATE TABLE users (
    id              bigserial PRIMARY KEY,
    discord_id      text UNIQUE NOT NULL,
    username        text NOT NULL,
    avatar          text,
    role            text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'contributor', 'admin')),
    trust           double precision NOT NULL DEFAULT 0.5,
    banned          boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_login_at   timestamptz
);

CREATE TABLE sessions (
    id              text PRIMARY KEY,             -- sha256 of the cookie value
    user_id         bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id              bigserial PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users ON DELETE CASCADE,
    name            text NOT NULL,
    prefix          text NOT NULL,                -- first chars shown in the UI
    key_hash        text UNIQUE NOT NULL,         -- sha256 of the key
    scopes          text[] NOT NULL DEFAULT '{read,contribute}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz,
    revoked_at      timestamptz
);

CREATE TABLE contributions (
    id              bigserial PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users,
    kind            text NOT NULL,                -- bazaar | auctions_ended | auctions_page | mod_events
    received_at     timestamptz NOT NULL DEFAULT now(),
    data_ts         timestamptz,
    status          text NOT NULL,                -- accepted | duplicate | rejected | pending
    reason          text,
    payload_sha256  text,
    bytes           integer
);
CREATE INDEX contributions_user ON contributions (user_id, received_at);

-- Events reported by the companion mod (the contributor's own actions). Published only as aggregates.
CREATE TABLE mod_events (
    id              bigserial PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES users,
    ts              timestamptz NOT NULL,
    event           text NOT NULL CHECK (event IN ('order_created', 'order_filled', 'order_claimed', 'order_cancelled',
                                                   'order_flipped', 'instant_buy', 'instant_sell', 'gui_step')),
    item_id         text,
    side            text CHECK (side IN ('buy', 'sell')),
    amount          bigint,
    price           bigint,                      -- centicoins per unit
    duration_ms     integer,                     -- time the action took in the client
    ping_ms         integer,
    order_age_ms    bigint,                      -- for fills: time since the order was created
    extra           jsonb
);
CREATE INDEX mod_events_item ON mod_events (item_id, ts);
