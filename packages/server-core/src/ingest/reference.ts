// Items, elections / mayors (Hypixel), and recipes (NotEnoughUpdates-REPO, MIT).
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";
import { SB_YEAR, parseNeuItem, termStart, type Recipe } from "@bc/shared";
import { type Db, insertMany } from "../db.js";
import { type ElectionResponse, fetchElection, fetchItems, getJson } from "../hypixel.js";

export async function ingestItems(db: Db): Promise<number> {
  const { items } = await fetchItems();
  return insertMany(db, "items", ["id", "name", "category", "tier", "material", "npc_sell_price", "updated_at"],
    items.map(i => [i.id, i.name ?? null, i.category ?? null, i.tier ?? null, i.material ?? null, i.npc_sell_price ?? null, new Date().toISOString()]),
    "ON CONFLICT (id) DO UPDATE SET name = excluded.name, category = excluded.category, tier = excluded.tier, material = excluded.material, npc_sell_price = excluded.npc_sell_price, updated_at = excluded.updated_at");
}

/** Store an election response and upsert the mayor term it describes. */
export async function storeElection(db: Db, d: ElectionResponse, origin = 1): Promise<void> {
  if (!d?.success) return;
  const year = d.current?.year ?? d.mayor?.election?.year ?? null;
  await db.query("INSERT INTO election_snapshots (ts, sb_year, origin, data) VALUES ($1::timestamptz, $2, $3, $4) ON CONFLICT DO NOTHING",
    [new Date(d.lastUpdated).toISOString(), year, origin, JSON.stringify(d)]);
  const m = d.mayor, ey = m?.election?.year;
  if (!m || !ey) return;
  const start = termStart(ey);
  const cands = m.election?.candidates ?? [];
  await db.query(
    `INSERT INTO mayors (election_year, mayor_key, mayor_name, start_ts, end_ts, votes, perks, minister, candidates)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9)
     ON CONFLICT (election_year) DO UPDATE SET perks = excluded.perks, minister = coalesce(excluded.minister, mayors.minister),
       votes = coalesce(excluded.votes, mayors.votes), candidates = excluded.candidates`,
    [ey, m.key, m.name, new Date(start).toISOString(), new Date(start + SB_YEAR).toISOString(), cands.find(c => c.key === m.key)?.votes ?? null,
      JSON.stringify((m.perks ?? []).map(p => ({ name: p.name, description: p.description ?? null }))),
      m.minister ? JSON.stringify({ key: m.minister.key, name: m.minister.name, perk: m.minister.perk?.name ?? null }) : null,
      JSON.stringify(cands.map(c => ({ key: c.key, name: c.name, votes: c.votes ?? null, perks: c.perks.map(p => p.name) })))]);
}

export async function ingestElection(db: Db): Promise<void> {
  await storeElection(db, await fetchElection());
}

const NEU_REPO = "NotEnoughUpdates/NotEnoughUpdates-REPO";
/** Bump when parsing changes so the next sync re-reads the same commit (2: damage-value ids, NPC shop prices). */
const NEU_PARSER = 3; // 3: pets ("BEE;0") no longer read as enchanted books

/** Download the NEU repo tarball, parse every item, and replace the recipes table. Returns the commit used. */
export async function syncNeuRecipes(db: Db): Promise<{ commit: string; recipes: number }> {
  // GitHub's API allows few anonymous calls per IP (shared by every GitHub Actions runner on it): send a token when
  // there is one (the publish workflow passes its own), and if the lookup still fails, take the newest files directly
  // from the download server (not the rate-limited API) without knowing the commit
  const token = process.env.GITHUB_TOKEN;
  let sha = "master";
  try {
    sha = (await getJson<{ sha: string }>(`https://api.github.com/repos/${NEU_REPO}/commits/master`,
      { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } })).sha;
  } catch (e) { console.warn(`NEU commit lookup failed (${(e as Error).message}); downloading the newest files instead`); }
  const prev = await db.query("SELECT source_version FROM recipes WHERE source = 'neu' LIMIT 1");
  const version = `${sha}#p${NEU_PARSER}`;
  if (sha !== "master" && prev.rows[0]?.source_version === version) return { commit: sha, recipes: 0 };
  const dir = await mkdtemp(join(tmpdir(), "neu-"));
  try {
    const res = await fetch(`https://codeload.github.com/${NEU_REPO}/tar.gz/${sha}`);
    if (!res.ok || !res.body) throw new Error(`NEU download failed: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), tar.x({ cwd: dir, strip: 1, filter: p => p.includes("/items/") }));
    const itemsDir = join(dir, "items");
    const recipes: Recipe[] = [];
    const texts = new Map<string, string>();
    for (const f of await readdir(itemsDir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const item = JSON.parse(await readFile(join(itemsDir, f), "utf8"));
        const rs = parseNeuItem(item);
        recipes.push(...rs);
        for (const r of rs) if (r.kind !== "npc" && item.crafttext) texts.set(r.outputId, item.crafttext);
      } catch { /* skip malformed file */ }
    }
    const key = (r: Recipe) => r.inputs.map(i => `${i.id}:${i.qty}`).sort().join(",");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM recipes WHERE source = 'neu'");
      const seen = new Set<string>();
      const rows = recipes.filter(r => { const k = `${r.outputId}|${r.kind}|${key(r)}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(r => [r.outputId, r.kind, JSON.stringify(r.inputs), r.outputCount, r.durationS ?? null, JSON.stringify(r.requirements), r.kind === "npc" ? r.source ?? null : texts.get(r.outputId) ?? null, "neu", version, key(r)]);
      await insertMany(client, "recipes", ["output_id", "kind", "inputs", "output_count", "duration_s", "requirements", "requirement_text", "source", "source_version", "inputs_key"], rows);
      await client.query("COMMIT");
      return { commit: sha, recipes: rows.length };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
