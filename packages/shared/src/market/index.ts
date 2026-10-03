// Module "market". Market data: types, signals (flow, typical prices, warning flags), item names, order-book packing,
// assembling the calculator's market, event-impact analysis. Depends on: rules.
// Other modules import from this file only; see README.md in this folder.
export * from "./types.js";
export * from "./signals.js";
export * from "./names.js";
export * from "./book.js";
export * from "./assemble.js";
export * from "./event-impact.js";
export * from "./dips.js";
