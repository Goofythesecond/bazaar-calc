// Calculator endpoints. GET uses defaults (or query params), POST takes {settings, profile, filters}. The computation is
// shared with the static website (packages/shared/src/service/endpoints.ts).
import type { FastifyInstance } from "fastify";
import { CALC_KINDS, alertCheckResponse, calcResponse, describePerks, planResponse } from "@bc/shared";
import type { State } from "../state.js";

export function registerCalc(app: FastifyInstance, state: State) {
  const build = state.opportunities.bind(state);
  const meta = () => ({ marketAt: state.loadedAt, dataAt: state.dataAt, perks: describePerks(state.perks) });
  for (const kind of CALC_KINDS) {
    app.post(`/api/v1/calc/${kind}`, async req => calcResponse(build, kind, req.body, meta()));
    app.get(`/api/v1/calc/${kind}`, async () => calcResponse(build, kind, {}, meta()));
  }
  app.post("/api/v1/calc/plan", async req => planResponse(build, req.body, meta()));
  app.post("/api/v1/alerts/check", async req => alertCheckResponse(build, req.body, meta()));
}
