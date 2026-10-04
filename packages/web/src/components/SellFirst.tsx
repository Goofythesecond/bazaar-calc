// "Sell first" reminder on the flip and planner pages: your tracked buy orders whose units filled but are not listed
// for sale yet (unsoldBuys in @bc/shared). Listing them before buying more keeps coins turning over and stops
// purchases from outpacing sales. Only orders you track on My orders are known; nothing reads your account.
import { Link } from "react-router-dom";
import { unsoldBuys } from "@bc/shared";
import { num } from "../lib";
import { trackedOrders } from "../prefs";
import { Icon } from "./Icon";

export function SellFirst() {
  const unsold = unsoldBuys(trackedOrders.use());
  if (!unsold.length) return null;
  const list = unsold.slice(0, 3).map(o => `${num(o.filled)} ${o.name}`).join(", ");
  return (
    <div className="note" role="status">
      <Icon name="warn" />
      <span><b>Sell first:</b> you bought {list}{unsold.length > 3 ? ` and ${unsold.length - 3} more` : ""} without a sell offer yet. List {unsold.length === 1 ? "it" : "them"} before buying more, so your coins keep turning over. <Link to="/orders">My orders</Link></span>
    </div>
  );
}
