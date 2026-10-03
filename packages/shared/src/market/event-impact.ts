// Event impact and outlook: how an item's mid price behaved during past occurrences of each event, and what that
// suggests for upcoming ones. Correlation, not causation: overlapping events and the general trend are not removed,
// so every number carries its sample size and consistency.
import type { GameEvent } from "../rules/index.js";

export interface Point { t: number; v: number }

export interface EventImpact {
  name: string;
  kind: GameEvent["kind"];
  n: number;               // occurrences with enough data
  mean: number;            // average change during the event vs the 24 h before
  median: number;
  consistency: number;     // share of occurrences moving in the majority direction
  after: number | null;    // average change in the 24 h after vs before
  last: number;            // most recent occurrence's change
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function windowMedian(points: Point[], from: number, to: number): number | null {
  // points sorted by t
  let lo = 0, hi = points.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid]!.t < from) lo = mid + 1; else hi = mid; }
  const vals: number[] = [];
  for (let i = lo; i < points.length && points[i]!.t < to; i++) vals.push(points[i]!.v);
  return vals.length >= 3 ? median(vals) : null;
}

/** Group events by name (mayor terms by mayor) and measure the mid-price change during each occurrence. */
export function eventImpact(points: Point[], events: GameEvent[], minOccurrences = 2): EventImpact[] {
  const DAY = 86400_000;
  const groups = new Map<string, { kind: GameEvent["kind"]; ch: number[]; after: number[]; last: number }>();
  for (const e of events) {
    if (e.kind === "realtime" && e.name === "Bingo") continue; // affects Bingo profiles only
    const before = windowMedian(points, e.start - DAY, e.start);
    const during = windowMedian(points, e.start, Math.min(e.end, e.start + 7 * DAY));
    if (before == null || during == null || before <= 0) continue;
    const after = windowMedian(points, e.end, e.end + DAY);
    const g = groups.get(e.name) ?? { kind: e.kind, ch: [], after: [], last: 0 };
    g.ch.push(during / before - 1);
    if (after != null) g.after.push(after / before - 1);
    g.last = during / before - 1;
    groups.set(e.name, g);
  }
  const out: EventImpact[] = [];
  for (const [name, g] of groups) {
    if (g.ch.length < minOccurrences) continue;
    const up = g.ch.filter(c => c > 0).length;
    out.push({ name, kind: g.kind, n: g.ch.length, mean: g.ch.reduce((a, b) => a + b, 0) / g.ch.length, median: median(g.ch),
      consistency: Math.max(up, g.ch.length - up) / g.ch.length, after: g.after.length ? g.after.reduce((a, b) => a + b, 0) / g.after.length : null, last: g.last });
  }
  return out.sort((a, b) => Math.abs(b.mean) * Math.sqrt(b.n) - Math.abs(a.mean) * Math.sqrt(a.n));
}

export interface OutlookEntry {
  itemId: string;
  event: string;
  eventStart: number;
  eventEnd: number;
  expectedChange: number;
  consistency: number;
  samples: number;
  confidence: "low" | "medium" | "high";
}

/** Expected moves for items during upcoming events, from their measured history. */
export function outlook(upcoming: GameEvent[], impacts: Map<string, EventImpact[]>, minAbsChange = 0.02): OutlookEntry[] {
  const out: OutlookEntry[] = [];
  for (const e of upcoming) {
    for (const [itemId, list] of impacts) {
      const imp = list.find(x => x.name === e.name);
      if (!imp || Math.abs(imp.mean) < minAbsChange) continue;
      const confidence = imp.n >= 8 && imp.consistency >= 0.75 ? "high" : imp.n >= 4 && imp.consistency >= 0.65 ? "medium" : "low";
      out.push({ itemId, event: e.name, eventStart: e.start, eventEnd: e.end, expectedChange: imp.mean, consistency: imp.consistency, samples: imp.n, confidence });
    }
  }
  return out.sort((a, b) => a.eventStart - b.eventStart || Math.abs(b.expectedChange) - Math.abs(a.expectedChange));
}
