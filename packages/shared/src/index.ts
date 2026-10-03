// Public API of @bc/shared, the calculation code shared by the server, the static website and the collectors.
// Other packages import from "@bc/shared" only, never from files inside it. Modules are listed lowest layer first: a
// module may import only from modules listed above it (checked by scripts/checks/architecture.mjs). See README.md.
export * from "./rules/index.js";
export * from "./market/index.js";
export * from "./recipes/index.js";
export * from "./fill/index.js";
export * from "./calc/index.js";
export * from "./data/index.js";
export * from "./service/index.js";

export const NOTICE = {
  affiliation: "Not affiliated with or endorsed by Hypixel. NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.",
  data: "Market data: Hypixel Public API. Recipes: NotEnoughUpdates-REPO (MIT). Game rules: hypixelskyblock.minecraft.wiki (CC BY-NC-SA 3.0).",
};
