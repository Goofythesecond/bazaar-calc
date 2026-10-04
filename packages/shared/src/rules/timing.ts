// How long bazaar / anvil / forge actions take. No source publishes these; the model is:
//   one GUI step   = ping + server tick (50 ms) + your click delay
//   one command    = ping + server tick + time to type it
//   sign input     = ping + server tick + time to type the number
// Step lists follow the real menus (SkyHanni inventory-title patterns, see research/RESEARCH.md).
// Companion-mod contributors can upload measured timings that replace these defaults.

export interface TimingSettings {
  pingMs: number;        // your round trip to Hypixel
  clickDelayMs: number;  // how fast you click once a menu has opened
  typingMs: number;      // typing a command or a number into a sign
}

export const DEFAULT_TIMING: TimingSettings = { pingMs: 80, clickDelayMs: 350, typingMs: 1500 };
export const SERVER_TICK_MS = 50;

type Step = "command" | "click" | "sign";

export interface ActionDef { label: string; steps: Step[]; menus: string[] }

export const ACTIONS: Record<string, ActionDef> = {
  create_buy_order: {
    label: "Create buy order",
    steps: ["command", "click", "click", "sign", "click", "click"],
    menus: ["/bz <item>", "Bazaar ➜ <item>", "Create Buy Order", "How many do you want? (custom amount)", "How much do you want to pay? (top +0.1)", "Confirm Buy Order"],
  },
  create_sell_offer: {
    label: "Create sell offer",
    steps: ["command", "click", "click", "click", "click"],
    menus: ["/bz <item>", "Bazaar ➜ <item>", "Create Sell Offer", "At what price are you selling? (best -0.1)", "Confirm Sell Offer"],
  },
  instant_buy: {
    label: "Instant buy",
    steps: ["command", "click", "click", "sign", "click"],
    menus: ["/bz <item>", "Bazaar ➜ <item>", "Buy Instantly", "How many do you want? (custom amount)", "Confirm Instant Buy"],
  },
  npc_buy: {
    label: "Buy one stack from an NPC shop",
    steps: ["click", "click"],
    menus: ["NPC shop menu", "click the item (one stack)"],
  },
  npc_sell: {
    label: "Sell one stack to an NPC shop",
    steps: ["click", "click"],
    menus: ["NPC shop menu", "click the stack in your inventory"],
  },
  instant_sell: {
    label: "Instant sell",
    steps: ["command", "click", "click"],
    menus: ["/bz <item>", "Bazaar ➜ <item>", "Sell Instantly"],
  },
  claim_order: {
    label: "Claim a filled order",
    steps: ["command", "click", "click"],
    menus: ["/bz", "Manage Orders", "Your Bazaar Orders: click order"],
  },
  cancel_order: {
    label: "Cancel an order",
    steps: ["command", "click", "click", "click"],
    menus: ["/bz", "Manage Orders", "Your Bazaar Orders: click order", "Order options: Cancel"],
  },
  flip_order: {
    label: "Flip a filled buy order to a sell offer",
    steps: ["command", "click", "click", "click", "click"],
    menus: ["/bz", "Manage Orders", "Your Bazaar Orders: click order", "Order options: Flip", "Price (best -0.1)"],
  },
  relist_buy_order: {
    label: "Relist a buy order (claim + cancel + create)",
    steps: ["command", "click", "click", "click", "click", "command", "click", "click", "sign", "click", "click"],
    menus: ["/bz", "Manage Orders", "claim filled part", "click order", "Cancel", "/bz <item>", "Bazaar ➜ <item>", "Create Buy Order", "amount", "price", "Confirm"],
  },
  relist_sell_offer: {
    label: "Relist a sell offer (claim + cancel + create)",
    steps: ["command", "click", "click", "click", "click", "command", "click", "click", "click", "click"],
    menus: ["/bz", "Manage Orders", "claim coins", "click order", "Cancel", "/bz <item>", "Bazaar ➜ <item>", "Create Sell Offer", "price", "Confirm"],
  },
  craft: {
    label: "Craft (crafting table, one recipe output)",
    steps: ["command", "click", "click"],
    menus: ["/craft", "recipe / quick craft slot", "take output"],
  },
  anvil_combine: {
    label: "Combine two books in an anvil",
    steps: ["click", "click", "click", "click"],
    menus: ["book 1 into anvil", "book 2 into anvil", "Combine", "take result"],
  },
  ah_buy: {
    label: "Buy the lowest BIN on the auction house",
    steps: ["command", "click", "sign", "click", "click", "click"],
    menus: ["/ah", "Auctions Browser", "search (item name)", "cheapest BIN", "Buy Item Right Now", "Confirm"],
  },
  ah_sell: {
    label: "List a BIN on the auction house",
    steps: ["command", "click", "click", "click", "sign", "click", "click"],
    menus: ["/ah", "Create Auction", "item from your inventory", "BIN", "price (sign)", "Create BIN Auction", "Confirm"],
  },
  kat_start: {
    label: "Leave a pet with Kat",
    steps: ["click", "click", "click"],
    menus: ["Kat (Hub)", "pet from your inventory", "Confirm (pays the coins and items)"],
  },
  kat_claim: {
    label: "Collect a pet from Kat",
    steps: ["click", "click"],
    menus: ["Kat (Hub)", "finished pet"],
  },
  shard_fuse: {
    label: "Fuse two kinds of shards",
    // the menu as the wiki describes it (Attribute Fusion/UI): pick a shard, pick the other, choose a result, confirm
    steps: ["click", "click", "click", "click", "click"],
    menus: ["Fusion Machine (Fusion House, Galatea) or Kysha's Abiphone contact", "first shard from your Hunting Box", "second shard", "result to make", "Confirm"],
  },
  forge_start: {
    label: "Start a forge process",
    steps: ["command", "click", "click", "click"],
    menus: ["/forge", "empty slot", "recipe", "Confirm"],
  },
  forge_claim: {
    label: "Claim a forge slot",
    steps: ["command", "click"],
    menus: ["/forge", "finished slot"],
  },
};

export function stepMs(step: Step, t: TimingSettings): number {
  const base = t.pingMs + SERVER_TICK_MS;
  if (step === "click") return base + t.clickDelayMs;
  return base + t.typingMs; // command or sign
}

export function actionSeconds(action: keyof typeof ACTIONS | string, t: TimingSettings): number {
  const def = ACTIONS[action];
  if (!def) return 0;
  return def.steps.reduce((s, step) => s + stepMs(step, t), 0) / 1000;
}

export function timingTable(t: TimingSettings) {
  return Object.entries(ACTIONS).map(([key, def]) => ({
    key, label: def.label, steps: def.steps.length, seconds: actionSeconds(key, t), menus: def.menus,
  }));
}
