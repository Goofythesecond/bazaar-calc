-- Small reference documents (e.g. NEU constants/leveling.json used by the profile import).
CREATE TABLE IF NOT EXISTS kv (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    source      text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
