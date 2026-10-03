#!/usr/bin/env node
// Import contribution data files into a self-hosted server's database. Hours your own scanner already recorded are
// left as they are; importing the same files twice adds nothing. Stop the service first when using PGlite.
//   node scripts/data/import.mjs <pglite dir | postgres url> <file or folder> [...]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { createPool, importDataFiles, migrate } from "@bc/server-core";
import { decodeDataFile, sanityCheck } from "@bc/shared";

const [src, ...paths] = process.argv.slice(2);
if (!src || !paths.length) { console.error("usage: import.mjs <pglite dir | postgres url> <file or folder> [...]"); process.exit(2); }
const found = [];
const walk = p => { if (statSync(p).isDirectory()) for (const n of readdirSync(p).sort()) walk(join(p, n)); else if (p.endsWith(".json.gz")) found.push(p); };
paths.forEach(walk);
const files = [];
for (const p of found) {
  try {
    const f = decodeDataFile(zlib.gunzipSync(readFileSync(p)).toString());
    const { errors } = sanityCheck(f);
    if (errors.length) throw new Error(errors.join("; "));
    files.push({ label: p, file: f });
  } catch (e) { console.log(`skipped ${p}: ${e.message}`); }
}
const db = createPool(src.startsWith("postgres") ? src : `pglite:${src}`);
await migrate(db);
const r = await importDataFiles(db, files, { skipCovered: true });
for (const f of r.files) console.log(`${f.label}: ${f.picked}/${f.hours} hours new, ${f.polls} polls, ${f.closes} closes, ${f.episodes} episodes, ${f.sales} sales`);
console.log(`${r.hours} hours imported; statistics update on the scanner's next run`);
await db.end();
