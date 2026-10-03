// Scanner + website in ONE process sharing one database connection. Needed for the built-in database
// (DATABASE_URL=pglite:...), which only one process can open; also fine with Postgres.
import { createPool } from "@bc/server-core";
import { startWorker } from "@bc/worker";
import { startApi } from "./server.js";

const db = createPool();
const stopWorker = await startWorker(db);
const closeApi = await startApi(db);
console.log(`website on http://${process.env.API_HOST ?? "127.0.0.1"}:${process.env.API_PORT ?? 8787}`);
const stop = async () => { stopWorker(); await closeApi(); await db.end(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
