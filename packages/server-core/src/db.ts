// Database access: a Postgres pool or the built-in PGlite (one folder, one process), migrations, monthly partitions
// and a chunked multi-row INSERT. Everything runs in UTC.
import pg from "pg";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// BIGINT columns come back as strings by default; our values fit comfortably in a double.
pg.types.setTypeParser(20, v => Number(v));

export type Db = pg.Pool;

/**
 * DATABASE_URL=postgres://...      -> a normal Postgres server (what the public site should use)
 * DATABASE_URL=pglite:./data/pg    -> built-in Postgres (PGlite) stored in a folder; nothing to install.
 *                                     Single process only: run the worker OR the API on one folder, not both.
 */
export function createPool(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set (postgres://... or pglite:./path)");
  if (url.startsWith("pglite:")) return createPglite(url.slice("pglite:".length) || "./data/pg");
  return new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10), options: "-c TimeZone=UTC" });
}

/** node-postgres-compatible facade over one PGlite instance. A lock serialises access so a transaction opened with
 *  connect() is never interleaved with statements from another job. */
function createPglite(dir: string): Db {
  type Lite = { exec(q: string): Promise<{ rows: unknown[]; affectedRows?: number }[]>; query(q: string, p?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>; close(): Promise<void> };
  let ready: Promise<Lite> | null = null;
  const open = () => (ready ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    mkdirSync(resolve(dir, ".."), { recursive: true });
    const lite = (await PGlite.create(dir, { parsers: { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) } })) as unknown as Lite;
    // everything is UTC: month partitions, hourly buckets and "now()" arithmetic must not follow the PC's timezone
    await lite.exec("SET TIME ZONE 'UTC'");
    return lite;
  })());
  let chain: Promise<void> = Promise.resolve();
  const lock = async () => {
    let release!: () => void;
    const prev = chain;
    chain = new Promise<void>(r => (release = r));
    await prev;
    return release;
  };
  const run = async (lite: Lite, text: string, params?: unknown[]) => {
    if (!params || params.length === 0) {
      const res = await lite.exec(text);
      const last = res.at(-1);
      return { rows: last?.rows ?? [], rowCount: (last?.rows.length || last?.affectedRows) ?? 0 };
    }
    const r = await lite.query(text, params);
    return { rows: r.rows, rowCount: r.rows.length || (r.affectedRows ?? 0) };
  };
  const query = async (text: string, params?: unknown[]) => {
    const lite = await open();
    const release = await lock();
    try { return await run(lite, text, params); } finally { release(); }
  };
  const connect = async () => {
    const lite = await open();
    const release = await lock();
    return { query: (text: string, params?: unknown[]) => run(lite, text, params), release };
  };
  const end = async () => { if (ready) await (await ready).close(); };
  return { query, connect, end } as unknown as Db;
}

export const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../db/migrations");

/** Apply db/migrations/*.sql in name order, each once. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(r => r.name));
  const applied: string[] = [];
  for (const f of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
      await client.query("COMMIT");
      applied.push(f);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}

const ensured = new Set<string>();
/** Create the monthly partition that holds `ts` for a partitioned table. */
export async function ensurePartition(db: Db | pg.PoolClient, table: string, ts: number): Promise<void> {
  const d = new Date(ts);
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const key = `${table}:${month}`;
  if (ensured.has(key)) return;
  await db.query("SELECT bc_ensure_month_partition($1, $2::date)", [table, month]);
  ensured.add(key);
}

/** Multi-row INSERT helper (chunks to stay under the 65k parameter limit). */
export async function insertMany(db: Db | pg.PoolClient, table: string, cols: string[], rows: unknown[][], suffix = "ON CONFLICT DO NOTHING"): Promise<number> {
  let n = 0;
  const per = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = chunk.map(r => `(${r.map(v => { params.push(v); return `$${params.length}`; }).join(",")})`);
    const res = await db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${values.join(",")} ${suffix}`, params);
    n += res.rowCount ?? 0;
  }
  return n;
}
