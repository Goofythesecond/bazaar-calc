#!/usr/bin/env node
// Export a bazaar-calc database (your own scanner's polls, Internet Archive copies, auction data) as contribution data
// files, one per UTC day. Run it on a COPY of the database folder, or with the service stopped.
//   node scripts/data/export.mjs <pglite dir | postgres url> <github login> <out dir> [fromISO] [toISO]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";
import { createPool, exportDataFiles } from "@bc/server-core";
import { coverage, dataFileName, encodeDataFile, sanityCheck } from "@bc/shared";

const [src, name, out, fromArg, toArg] = process.argv.slice(2);
if (!src || !name || !out) { console.error("usage: export.mjs <pglite dir | postgres url> <github login> <out dir> [fromISO] [toISO]"); process.exit(2); }
const db = createPool(src.startsWith("postgres") ? src : `pglite:${src}`);
mkdirSync(out, { recursive: true });
const files = await exportDataFiles(db, name, "export-1", { from: fromArg ? Date.parse(fromArg) : undefined, to: toArg ? Date.parse(toArg) : undefined });
let total = 0;
for (const f of files) {
  const { errors, warnings } = sanityCheck(f);
  const gz = zlib.gzipSync(encodeDataFile(f), { level: 9 });
  const file = join(out, f.collector.source === "wayback" ? dataFileName(f).replace(".json.gz", "_wayback.json.gz") : dataFileName(f));
  writeFileSync(file, gz);
  total += gz.length;
  const c = coverage(f);
  console.log(`${file}: ${(gz.length / 1e6).toFixed(2)} MB, ${c.polls} polls (${c.hours.toFixed(1)} h), ${c.closes} closes, ${f.flow.item.length} flow rows, ${c.episodes} episodes, ${c.sales} sales, ${c.bins} BIN rows${errors.length ? `\n  ERRORS: ${errors.join("; ")}` : ""}${warnings.length ? `\n  warnings: ${warnings.join("; ")}` : ""}`);
}
console.log(`${files.length} files, ${(total / 1e6).toFixed(1)} MB`);
await db.end();
