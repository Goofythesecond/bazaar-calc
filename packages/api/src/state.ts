// In-memory caches of the market, recipes and events, refreshed from Postgres.
import { type Db, currentPerks, loadEvents, loadMarket, loadRecipes } from "@bc/server-core";
import { type Ctx, type GameEvent, type ItemMarket, NO_PERKS, type Opportunity, type RankedOpportunity, type PerkEffects, type Profile, type Recipe, type Settings, buildOpportunities } from "@bc/shared";

export class State {
  market = new Map<string, ItemMarket>();
  recipes = new Map<string, Recipe[]>();
  events: GameEvent[] = [];
  /** mayor / minister perks active now (tax, forge times, NPC limits) */
  perks: PerkEffects = NO_PERKS;
  loadedAt = 0;
  /** when Hypixel published the newest prices in the market (not when we re-read the database) */
  dataAt = 0;
  private timers: NodeJS.Timeout[] = [];

  constructor(private db: Db) {}

  private recipeVersion = "";
  async refresh(): Promise<void> {
    // reload recipes as soon as a new NEU sync lands (otherwise every 10 min)
    const v = String((await this.db.query("SELECT max(source_version) AS v, count(*) AS n FROM recipes")).rows.map(r => `${r.v}|${r.n}`)[0] ?? "");
    if (v !== this.recipeVersion) { this.recipeVersion = v; this.recipes = await loadRecipes(this.db); }
    this.market = await loadMarket(this.db);
    this.perks = await currentPerks(this.db);
    this.loadedAt = Date.now();
    this.dataAt = Math.max(0, ...[...this.market.values()].filter(m => m.ask != null || m.bid != null).map(m => m.ts));
  }
  async refreshSlow(): Promise<void> {
    this.recipes = await loadRecipes(this.db);
    this.events = await loadEvents(this.db, Date.now() - 400 * 86400_000, Date.now() + 14 * 86400_000);
  }
  async start(): Promise<void> {
    await Promise.all([this.refresh(), this.refreshSlow()]);
    this.timers.push(setInterval(() => void this.refresh().catch(() => {}), 30_000));
    this.timers.push(setInterval(() => void this.refreshSlow().catch(() => {}), 600_000));
  }
  stop() { this.timers.forEach(clearInterval); }

  ctx(settings: Settings, profile: Profile): Ctx {
    return { market: this.market, recipes: this.recipes, settings, profile: { ...profile, coleMoltenForge: profile.coleMoltenForge || this.perks.coleMoltenForge,
      quadTaxes: profile.quadTaxes || this.perks.quadTaxes, npcShoppingSpree: profile.npcShoppingSpree || this.perks.shoppingSpree } };
  }

  /** `listAll`: every route incl. losing ones and flagged markets (flip tables); off for the planner. */
  opportunities(kind: Opportunity["kind"] | "all", settings: Settings, profile: Profile, includeAhForge = false, listAll = false): { list: RankedOpportunity[]; skipped: NonNullable<Ctx["skipped"]> } {
    const key = JSON.stringify([kind, settings, profile, includeAhForge, listAll, this.loadedAt]);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const res = this.build(kind, settings, profile, includeAhForge, listAll);
    this.cache.set(key, res);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
    return res;
  }
  private cache = new Map<string, { list: RankedOpportunity[]; skipped: NonNullable<Ctx["skipped"]> }>();

  private build(kind: Opportunity["kind"] | "all", settings: Settings, profile: Profile, includeAhForge: boolean, listAll: boolean) {
    return buildOpportunities({ market: this.market, recipes: this.recipes, perks: this.perks }, kind, settings, profile, includeAhForge, listAll);
  }
}

// request schemas and filters are shared with the static website (packages/shared/src/service/endpoints.ts)
export { FilterSchema, ProfileSchema, SettingsSchema, applyFilters } from "@bc/shared";
