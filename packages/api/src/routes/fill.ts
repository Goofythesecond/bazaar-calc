// Time on top, order sizing and quota time for one bazaar item, with the evidence behind them (computed by the shared
// fillReport, which the static website runs too).
import type { FastifyInstance } from "fastify";
import { HOLD_WINDOW_HOURS, type Db, loadEpisodes } from "@bc/server-core";
import { FILL_METHOD, fillReport } from "@bc/shared";
import type { State } from "../state.js";

export { FILL_METHOD };

export function registerFill(app: FastifyInstance, db: Db, state: State) {
  app.get<{ Params: { id: string }; Querystring: { check?: string; qty?: string; hours?: string; unknownShare?: string } }>("/api/v1/bazaar/:id/fill", async (req, reply) => {
    const id = req.params.id;
    const r = await fillReport(state.market.get(id), { hours: HOLD_WINDOW_HOURS, ...req.query }, (side, hours) => loadEpisodes(db, id, side, hours), state.loadedAt);
    if (!r) return reply.code(404).send({ error: "not on the bazaar or no prices right now" });
    return r;
  });
}
