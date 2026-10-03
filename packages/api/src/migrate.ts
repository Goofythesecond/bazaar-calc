// Command: apply the database migrations in db/migrations (pnpm db:migrate). Safe to run repeatedly.
import { createPool, migrate } from "@bc/server-core";
const db = createPool();
const applied = await migrate(db);
console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
await db.end();
