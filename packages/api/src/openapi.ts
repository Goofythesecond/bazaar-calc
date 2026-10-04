// Hand-written OpenAPI 3.1 description of the public API (served at /api/openapi.json).
const calcBody = {
  type: "object",
  properties: {
    settings: { $ref: "#/components/schemas/Settings" },
    profile: { $ref: "#/components/schemas/Profile" },
    filters: { $ref: "#/components/schemas/Filters" },
  },
};
const ok = (description: string) => ({ "200": { description } });

export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Bazaar Calc API",
    version: "1.0.0",
    description: "Hypixel SkyBlock market data and flip calculators. Market data from the Hypixel Public API. Not affiliated with or endorsed by Hypixel. Read endpoints are public (rate limited per IP; send X-API-Key for a higher limit). Contribution endpoints need an API key from the Contribute page.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
    schemas: {
      Settings: { type: "object", description: "All optional; defaults shown by GET /api/v1/rules/*", properties: {
        coins: { type: "number" }, bazaarFlipperLevel: { type: "integer", minimum: 0, maximum: 2 }, checkIntervalMin: { type: "number" },
        hoursPerDay: { type: "number" }, dailyLimit: { type: "number", description: "coins/day counted by Hypixel; community value 15e9" },
        attention: { type: "number", description: "share of each hour you can spend clicking" }, craftsPerHourMax: { type: "number" },
        unknownCompetitionShare: { type: "number" }, minUnitsPerHour: { type: "number" }, includeFlagged: { type: "boolean" },
        pingMs: { type: "number" }, clickDelayMs: { type: "number" }, typingMs: { type: "number" } } },
      Profile: { type: "object", properties: {
        hotmTier: { type: "integer" }, quickForgeLevel: { type: "integer" }, enchantingLevel: { type: "integer" }, xpLevels: { type: "integer" },
        collections: { type: "object", additionalProperties: { type: "integer" } }, slayers: { type: "object", additionalProperties: { type: "integer" } },
        reputation: { type: "object", additionalProperties: { type: "number" } }, coleMoltenForge: { type: "boolean" }, ignoreRequirements: { type: "boolean" } } },
      Filters: { type: "object", properties: {
        q: { type: "string" }, minCoinsH: { type: "number" }, minProfit: { type: "number" }, minMargin: { type: "number" }, maxCapital: { type: "number" },
        maxOrders: { type: "integer" }, requirementsMet: { type: "boolean" }, noFlags: { type: "boolean" },
        buyModes: { type: "array", items: { enum: ["instant", "order"] } }, sellModes: { type: "array", items: { enum: ["instant", "offer", "ah_reference"] } },
        sort: { enum: ["coinsH", "profitPerUnit", "marginPct", "unitsH", "capitalUsed"] }, limit: { type: "integer" }, offset: { type: "integer" },
        includeAhForge: { type: "boolean", description: "price forge and craft outputs that only sell on the auction house from the lowest BIN" },
        profitableOnly: { type: "boolean", description: "hide routes that lose money (all routes are listed by default)" } } },
    },
  },
  paths: {
    "/api/v1/status": { get: { summary: "Data freshness and coverage", responses: ok("status") } },
    "/api/v1/items": { get: { summary: "Search items", parameters: [{ name: "q", in: "query" }, { name: "bazaar", in: "query" }, { name: "limit", in: "query" }], responses: ok("items") } },
    "/api/v1/items/{id}": { get: { summary: "Item detail: market, order book, recipes, uses, stats, enchant rule", parameters: [{ name: "id", in: "path", required: true }], responses: ok("item") } },
    "/api/v1/bazaar/{id}/history": { get: { summary: "Bucketed bazaar history (prices in coins)", parameters: [{ name: "id", in: "path", required: true }, { name: "from", in: "query" }, { name: "to", in: "query" }, { name: "step", in: "query", description: "seconds" }], responses: ok("series") } },
    "/api/v1/market": { get: { summary: "The exact market snapshot the calculators use right now (best buy order / sell offer, 7-day volumes, warnings); ?ids=A,B for some items", parameters: [{ name: "ids", in: "query" }], responses: ok("market") } },
    "/api/v1/bazaar/{id}/fill": { get: {
      summary: "Time on top, order sizes and quota time for one item, with the measured evidence",
      description: "Per side (buy orders / sell offers): Kaplan-Meier survival of freshly posted best prices (last 24 h of 20 s polls), how often they are outbid vs filled, units per minute traded against the top, the order-size curve for your check interval (units/h, orders/h, daily-limit coins/h per size) and, with qty, a Monte Carlo estimate of the minutes needed to fill that quota (p10/p50/p90). Recomputed every poll; the episode summary every 10 minutes. `method` explains every step.",
      parameters: [{ name: "id", in: "path", required: true }, { name: "check", in: "query", description: "minutes between looks at your orders (default 5)" },
        { name: "qty", in: "query", description: "units you want (quota)" }, { name: "hours", in: "query", description: "episode window, 1-72 (default 24)" }],
      responses: ok("fill evidence") } },
    "/api/v1/bazaar/{id}/book": { get: { summary: "Stored order book at or before a time", parameters: [{ name: "id", in: "path", required: true }, { name: "ts", in: "query" }], responses: ok("book") } },
    "/api/v1/auctions/{key}": { get: { summary: "Auction lowest BIN history and recent sale prices (no player data)", parameters: [{ name: "key", in: "path", required: true }, { name: "days", in: "query" }], responses: ok("auction data") } },
    "/api/v1/mayors": { get: { summary: "Mayor terms and the current election", responses: ok("mayors") } },
    "/api/v1/events": { get: { summary: "Calendar, mayor and real-time events", parameters: [{ name: "from", in: "query" }, { name: "to", in: "query" }], responses: ok("events") } },
    "/api/v1/outlook": { get: { summary: "Expected price moves during upcoming events, from measured history", parameters: [{ name: "days", in: "query" }, { name: "minChange", in: "query" }], responses: ok("outlook") } },
    "/api/v1/dips": { get: { summary: "Items whose cheapest sell offer is well below the lower of the 24 h and 7-day medians, with profit after tax and whether the dip is new", parameters: [{ name: "minDrop", in: "query" }, { name: "flipperLevel", in: "query" }, { name: "limit", in: "query" }], responses: ok("dips") } },
    "/api/v1/books": { get: { summary: "Current order books and Hypixel's 7-day counters for up to 50 items (?ids=A,B); the order tracker follows your orders with them", parameters: [{ name: "ids", in: "query" }], responses: ok("books") } },
    "/api/v1/paper": { get: { summary: "The server's paper-trading record with its summary (realized / expected, win rate, time per trade): virtual orders on the calculator's top bazaar picks, filled from real trades", responses: ok("paper") } },
    "/api/v1/perks": { get: { summary: "Mayor perks that change the calculator right now (QUAD TAXES!!!, Shopping Spree, Molten Forge)", responses: ok("perks") } },
    "/api/v1/orders/check": { post: { summary: "Order tracking without a browser. Body {orders: [{item, side: buy|sell, price, amount}]}: new orders are placed in the queue; send the returned orders back on later calls to advance them (on top or behind, units ahead, filled) with the events since", responses: ok("orders") } },
    "/api/v1/alerts/check": { post: { summary: "The routes that meet alert rules right now, best first. Body {settings, profile, rules: {minCoinsH, minMarginPct, kinds, noWarnings, minConfidence, items}, limit}", responses: ok("alerts") } },
    "/api/v1/rules/bazaar": { get: { summary: "Bazaar rules (slots, tax with the active mayor perks, limits) with sources", responses: ok("rules") } },
    "/api/v1/rules/forge": { get: { summary: "Forge rules with sources", responses: ok("rules") } },
    "/api/v1/rules/requirements": { get: { summary: "Every collection / HotM / slayer / reputation requirement used by recipes, with the highest tier needed", responses: ok("requirements") } },
    "/api/v1/rules/enchants": { get: { summary: "Enchanted book combining rules with sources", responses: ok("rules") } },
    "/api/v1/rules/timing": { get: { summary: "Action timing model for your ping, plus contributor-measured timings", parameters: [{ name: "ping", in: "query" }, { name: "click", in: "query" }, { name: "typing", in: "query" }], responses: ok("timing") } },
    ...Object.fromEntries(["bazaar", "craft", "book", "forge", "npc", "all"].map(k => [`/api/v1/calc/${k}`, {
      post: { summary: `${k} flips for your settings (every route, losing ones too; each row has orderPlan: per order leg the size per order, orders/h, limit coins/h and the measured basis)`, requestBody: { content: { "application/json": { schema: calcBody } } }, responses: ok("opportunities") },
      get: { summary: `${k} flips with default settings`, responses: ok("opportunities") },
    }])),
    "/api/v1/calc/plan": { post: { summary: "Best combined plan within your slots, coins, forge slots and daily limit", requestBody: { content: { "application/json": { schema: { ...calcBody, properties: { ...calcBody.properties, options: { type: "object" } } } } } }, responses: ok("plan") } },
    "/api/v1/contribute/bazaar": { post: { summary: "Upload a raw /v2/skyblock/bazaar response", security: [{ apiKey: [] }], responses: ok("result") } },
    "/api/v1/contribute/auctions-ended": { post: { summary: "Upload a raw /v2/skyblock/auctions_ended response", security: [{ apiKey: [] }], responses: ok("result") } },
    "/api/v1/contribute/mod-events": { post: { summary: "Upload companion-mod events (your own bazaar actions and GUI timings)", security: [{ apiKey: [] }], responses: ok("result") } },
  },
};
