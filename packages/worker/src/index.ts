// Scanner only (no website). For scanner + website in one process see packages/api/src/all.ts.
import { createPool } from "@bc/server-core";
import { startWorker } from "./jobs.js";

const db = createPool();
await startWorker(db);
process.on("SIGTERM", async () => { await db.end(); process.exit(0); });
