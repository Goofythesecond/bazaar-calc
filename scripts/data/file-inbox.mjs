#!/usr/bin/env node
// Move approved (merged) contributions from data/inbox/ to data/contrib/<login>/<yyyy-mm>/, so the inbox stays short
// and every contributor's files sit together. Run by the publish workflow after a merge; prints the moves.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DATA_FILE_RE } from "@bc/shared";

const inbox = "data/inbox";
let moved = 0;
for (const n of existsSync(inbox) ? readdirSync(inbox) : []) {
  const m = DATA_FILE_RE.exec(n);
  if (!m) continue;
  const dir = join("data/contrib", m[1], `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}`);
  mkdirSync(dir, { recursive: true });
  let target = join(dir, n);
  for (let i = 2; existsSync(target); i++) target = join(dir, n.replace(".json.gz", `_${i}.json.gz`));
  execFileSync("git", ["mv", join(inbox, n), target]);
  console.log(`${join(inbox, n)} -> ${target}`);
  moved++;
}
console.log(`${moved} file(s) moved`);
