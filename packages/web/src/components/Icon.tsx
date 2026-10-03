// Small stroke icons drawn for this app (16px grid, 1.6 stroke, currentColor).
const P: Record<string, string> = {
  route: "M3 12.5a1.5 1.5 0 1 0 0-.01M13 3.5a1.5 1.5 0 1 0 0-.01M3 11V7a2 2 0 0 1 2-2h4M9 3l2 2-2 2M13 5v4a2 2 0 0 1-2 2H7",
  swap: "M3 5h9l-2.5-2.5M13 11H4l2.5 2.5",
  craft: "M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z",
  book: "M3 2.5h7.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2zM3 11.5a2 2 0 0 1 2-2h7.5",
  flame: "M8 14c-2.8 0-4.5-1.9-4.5-4.3 0-2.6 2.2-3.8 2.4-6.2 1.6 1 2.1 2.5 2.1 3.6.7-.5 1.1-1.3 1.2-2.2C10.7 6 12.5 7.6 12.5 9.8 12.5 12.1 10.8 14 8 14z",
  trend: "M2 12l4-4 3 3 5-6M10 5h4v4",
  box: "M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5 13.5 5M8 7.5v6",
  calendar: "M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3",
  clock: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5V8l2.5 1.5",
  upload: "M8 11V3M5 6l3-3 3 3M3 11v2.5h10V11",
  code: "M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5",
  pulse: "M1.5 8h3l1.5-4 3 8 1.5-4h4",
  info: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7v4M8 5h.01",
  sliders: "M3 4h10M3 8h10M3 12h10M6 2.5v3M10.5 6.5v3M5 10.5v3",
  order: "M4 2.5h8v11H4zM6 5.5h4M6 8h4M6 10.5h2",
  bolt: "M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z",
  anvil: "M2.5 5h9a2 2 0 0 0 2-2H5M4.5 5v2a2 2 0 0 0 2 2h1v2.5M5 13.5h6M8 11.5h0",
  sell: "M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10",
  warn: "M8 2 14.5 13.5h-13zM8 6.5v3.5M8 12h.01",
  check: "M3 8.5 6.5 12 13 4.5",
  x: "M4 4l8 8M12 4l-8 8",
  chevron: "M6 3.5 10.5 8 6 12.5",
  search: "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5",
};

export function Icon({ name, size = 16, title }: { name: keyof typeof P | string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] ?? P.info} />
    </svg>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 21.5l5.5-6 4 3.5 6.5-8" stroke="var(--accent-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="11" r="2.4" fill="var(--coin)" />
    </svg>
  );
}
