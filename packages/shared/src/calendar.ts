// SkyBlock calendar. 1 day = 20 real minutes, 31 days/month, 12 months/year (124 h). Year 1 began
// 2019-06-11 17:55:00 UTC; verified against real mayor terms (each starts exactly at Late Spring 27).
// Event schedules: wiki "Events" (archived official wiki 2025, and hypixelskyblock.minecraft.wiki), CC BY-NC-SA.

export const SB_EPOCH = 1560275700000;
export const SB_DAY = 20 * 60 * 1000;
export const SB_MONTH = 31 * SB_DAY;
export const SB_YEAR = 12 * SB_MONTH;
export const MONTHS = ["Early Spring", "Spring", "Late Spring", "Early Summer", "Summer", "Late Summer",
  "Early Autumn", "Autumn", "Late Autumn", "Early Winter", "Winter", "Late Winter"] as const;

export function sbTime(year: number, month = 1, day = 1): number {
  return SB_EPOCH + (year - 1) * SB_YEAR + (month - 1) * SB_MONTH + (day - 1) * SB_DAY;
}

export function sbDate(ms: number): { year: number; month: number; day: number } {
  const d = ms - SB_EPOCH;
  const year = Math.floor(d / SB_YEAR);
  const r = d - year * SB_YEAR;
  const month = Math.floor(r / SB_MONTH);
  return { year: year + 1, month: month + 1, day: Math.floor((r - month * SB_MONTH) / SB_DAY) + 1 };
}

export function sbFormat(ms: number): string {
  const { year, month, day } = sbDate(ms);
  return `${MONTHS[month - 1]} ${day}, Year ${year}`;
}

export interface GameEvent {
  kind: "calendar" | "mayor_term" | "mayor_perk" | "mayor_event" | "realtime";
  name: string;
  start: number;
  end: number;
  confidence: "exact" | "schedule_rule" | "approximate";
  detail?: string;
}

const span = (y: number, m1: number, d1: number, m2: number, d2: number) => [sbTime(y, m1, d1), sbTime(y, m2, d2) + SB_DAY] as const;
const utc = (s: string) => Date.parse(s + "Z");

const CALENDAR: [string, [number, number, number, number], string][] = [
  ["New Year Celebration", [12, 29, 12, 31], "2019-06-11T00:00:00"],
  ["Spooky Festival", [8, 29, 8, 31], "2019-10-27T00:00:00"],
  ["Spooky Festival shop & fishing", [8, 26, 9, 3], "2020-10-30T00:00:00"],
  ["Jerry's Workshop open", [12, 1, 12, 31], "2019-12-17T00:00:00"],
  ["Season of Jerry", [12, 24, 12, 26], "2019-12-17T00:00:00"],
  ["Traveling Zoo (summer)", [4, 1, 4, 3], "2020-02-21T00:00:00"],
  ["Traveling Zoo (winter)", [10, 1, 10, 3], "2020-02-21T00:00:00"],
  ["Hoppity's Hunt", [1, 1, 3, 31], "2024-04-24T00:00:00"],
];

export function calendarEvents(from: number, to: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let y = Math.max(1, sbDate(from).year); y <= sbDate(to).year; y++) {
    for (const [name, [m1, d1, m2, d2], added] of CALENDAR) {
      const [s, e] = span(y, m1, d1, m2, d2);
      if (s >= utc(added) && e > from && s < to) out.push({ kind: "calendar", name, start: s, end: e, confidence: "schedule_rule" });
    }
    const s = sbTime(y, 6, 27), e = sbTime(y + 1, 3, 27);
    if (s >= utc("2020-09-08T00:00:00") && e > from && s < to)
      out.push({ kind: "calendar", name: "Election booth open", start: s, end: e, confidence: "schedule_rule" });
  }
  return out;
}

export function realtimeEvents(from: number, to: number): GameEvent[] {
  const out: GameEvent[] = [];
  const add = (name: string, s: number, e: number, added: string, detail?: string) => {
    if (s >= utc(added) && e > from && s < to) out.push({ kind: "realtime", name, start: s, end: e, confidence: "approximate", detail });
  };
  for (let y = new Date(from).getUTCFullYear(); y <= new Date(to).getUTCFullYear(); y++) {
    for (let m = 0; m < 12; m++)
      add("Bingo", Date.UTC(y, m, 1), Date.UTC(y, m, 8), "2021-11-29T00:00:00", "First 7 days of every month; Bingo profiles cannot use the Bazaar");
    add("Great Spook", Date.UTC(y, 9, 1), Date.UTC(y, 10, 1), "2021-10-28T00:00:00");
    add("SkyBlock Anniversary", Date.UTC(y, 5, 11), Date.UTC(y, 5, 18), "2020-06-10T00:00:00");
    add("Jerry's Workshop open (December)", Date.UTC(y, 11, 1), Date.UTC(y + 1, 0, 1), "2019-12-17T00:00:00");
  }
  return out;
}

const MINING_FIESTA_MONTHS = [5, 6, 7, 8, 9];

/** Events implied by a mayor perk during one term. */
export function perkEvents(perk: string, termStart: number, termEnd: number): GameEvent[] {
  const p = perk.toLowerCase();
  const y0 = sbDate(termStart).year;
  const out: GameEvent[] = [];
  const inTerm = (s: number) => s >= termStart && s < termEnd;
  if (p === "fishing festival")
    for (const y of [y0, y0 + 1]) for (let m = 1; m <= 12; m++) {
      const [s, e] = span(y, m, 1, m, 3);
      if (inTerm(s)) out.push({ kind: "mayor_event", name: "Fishing Festival", start: s, end: e, confidence: "schedule_rule" });
    }
  else if (p === "mining fiesta")
    for (const y of [y0, y0 + 1]) for (const m of MINING_FIESTA_MONTHS) {
      const [s, e] = span(y, m, 1, m, 7);
      if (inTerm(s)) out.push({ kind: "mayor_event", name: "Mining Fiesta", start: s, end: e, confidence: "schedule_rule" });
    }
  else if (p === "mythological ritual") out.push({ kind: "mayor_event", name: "Mythological Ritual", start: termStart, end: termEnd, confidence: "schedule_rule" });
  else if (p === "chivalrous carnival") out.push({ kind: "mayor_event", name: "Carnival", start: termStart, end: termEnd, confidence: "schedule_rule" });
  else if (p === "molten forge") out.push({ kind: "mayor_event", name: "Molten Forge (-25% forge time)", start: termStart, end: termEnd, confidence: "schedule_rule" });
  else if (p.startsWith("extra event")) {
    const s = sbTime(y0, 6, 22);
    if (inTerm(s)) out.push({ kind: "mayor_event", name: `Foxy ${perk}`, start: s, end: s + 3 * SB_DAY, confidence: "approximate",
      detail: "Start per wiki; duration not published, 3 SkyBlock days assumed" });
  }
  return out;
}

export interface MayorTerm { electionYear: number; name: string; start: number; end: number; perks: string[]; minister?: { name: string; perk: string | null } | null }

export function mayorEvents(terms: MayorTerm[]): GameEvent[] {
  const out: GameEvent[] = [];
  for (const t of terms) {
    out.push({ kind: "mayor_term", name: `Mayor ${t.name}`, start: t.start, end: t.end, confidence: "exact",
      detail: [t.perks.join(", "), t.minister ? `minister ${t.minister.name}${t.minister.perk ? ` (${t.minister.perk})` : ""}` : ""].filter(Boolean).join(" · ") });
    // every perk is its own event so its price impact can be measured separately from the mayor's other perks
    for (const p of t.perks) {
      out.push({ kind: "mayor_perk", name: `Perk: ${p}`, start: t.start, end: t.end, confidence: "exact", detail: `Mayor ${t.name}` });
      out.push(...perkEvents(p, t.start, t.end));
    }
    if (t.minister?.perk) {
      out.push({ kind: "mayor_perk", name: `Perk: ${t.minister.perk}`, start: t.start, end: t.end, confidence: "exact", detail: `Minister ${t.minister.name}` });
      out.push(...perkEvents(t.minister.perk, t.start, t.end));
    }
  }
  return out;
}

/** Term start for a mayor elected in `electionYear`: Late Spring 27 of the following year. */
export function termStart(electionYear: number): number {
  return sbTime(electionYear + 1, 3, 27);
}
