// Market data types shared by every module: the order book, one item's market (live prices, history-based
// references, measured fill statistics, auction reference, warning flags) and the measured time-on-top summary.
// Prices are in COINS here (the database stores centicoins).

export interface BookLevel { price: number; amount: number; orders: number }

export interface ItemMarket {
  id: string;
  name: string;
  ts: number;
  ask: number | null;          // best sell offer = instant-buy price
  bid: number | null;          // best buy order  = instant-sell price
  askVolume: number;
  bidVolume: number;
  askOrders: number;
  bidOrders: number;
  ibuyWeek: number;            // units instant-bought in the last 7 days
  isellWeek: number;
  /** how often someone beat the best buy order / sell offer per hour (from our polls), null if unknown */
  undercutBuyH: number | null;
  undercutSellH: number | null;
  liveHours: number;           // hours of polls behind the undercut / measured-flow estimates
  /** units removed from the top buy-order / sell-offer levels per hour, measured from our order books (fills + cancels) */
  observedBuyFlowH?: number | null;
  /** "trades": observed flows are real instant trades (Hypixel's counters); "book": units that left the book (older data) */
  flowBasis?: "trades" | "book" | null;
  observedSellFlowH?: number | null;
  ref?: {
    askMed: number | null; bidMed: number | null; spreadMed: number | null; days: number;
    /** medians of hourly closes over the last 24 h / 7 days, and how many hourly closes back them */
    ask24?: number | null; bid24?: number | null; n24?: number; ask7?: number | null; bid7?: number | null; n7?: number;
    askVol24?: number | null; bidVol24?: number | null;
    /** top prices about an hour earlier (latest quote 1-3 h back); null when unknown */
    hourAgo?: { ask: number | null; bid: number | null } | null;
    /** last 24 h: units that left each side of the book vs real instant trades (from Hypixel's 7-day counters) */
    delists?: { hours: number; bidRemoved: number; bidTrades: number; askRemoved: number; askTrades: number; exact?: boolean } | null;
  } | null;
  topBid?: BookLevel[];
  topAsk?: BookLevel[];
  /** measured time-on-top episodes for the buy-order side (bid) and sell-offer side (ask), last 24 h */
  holdBid?: HoldStats | null;
  holdAsk?: HoldStats | null;
  /** coins an NPC shop pays for one (Hypixel's items resource); null if NPCs do not buy it */
  npcSellPrice?: number | null;
  /** one order holds at most 256 (Hypixel's items list says unstackable, or an enchanted book) instead of 71,680 */
  unstackable?: boolean;
  ahLowestBin?: number | null;
  ahMedianSale24h?: number | null;
  ahSales24h?: number;
  flags: string[];
  flagWhy: Record<string, string>;
}

/** All items, by Hypixel id. */
export type Market = Map<string, ItemMarket>;

/** Measured time-on-top statistics for one side of one item (see fill/toptrack.ts summarizeTop). */
export interface HoldStats {
  n: number;                 // fresh top-of-book episodes measured
  censored: number;          // still on top when the data stopped
  hours: number;             // hours of polls they came from
  p25: number | null; p50: number | null; p75: number | null; p90: number | null; // seconds on top (Kaplan-Meier)
  meanS: number;
  beatenFast: number;        // share beaten before a second poll
  outbid: number; gone: number;
  flowPerMin: number;        // units per minute traded against the top while it was on top
  unitsP50: number; unitsMean: number;
  holdQ: number[];
  samples: Sample[]; // [seconds on top, units traded, 1 if it ended by being used up] spread evenly over the window
}
/** [seconds on top, units traded against it, 1 if the episode ended because that order was used up / pulled (not beaten)] */
export type Sample = [number, number] | [number, number, number];
