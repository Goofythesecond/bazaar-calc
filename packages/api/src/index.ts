// Website + API only. Scanner runs separately (packages/worker) or together via all.ts.
import { createPool } from "@bc/server-core";
import { startApi } from "./server.js";

const db = createPool();
const close = await startApi(db);
const stop = async () => { await close(); await db.end(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
