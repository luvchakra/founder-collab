/**
 * MKT-03/MKT-14 — the reporting window every marketing number is computed over (§47:
 * "use explicit date ranges"). Pages read `?period=` and turn it into a closed date range
 * here, so the window a figure covers is always something the screen can state.
 */

export const MARKETING_PERIODS = ["30d", "90d", "365d"] as const;
export type MarketingPeriod = (typeof MARKETING_PERIODS)[number];

export const MARKETING_PERIOD_LABEL: Record<MarketingPeriod, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last 12 months",
};

const DAYS: Record<MarketingPeriod, number> = { "30d": 30, "90d": 90, "365d": 365 };

/** An unknown or missing value falls back to 30 days rather than failing the page. */
export function parsePeriod(raw: string | string[] | undefined): MarketingPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (MARKETING_PERIODS as readonly string[]).includes(value ?? "") ? (value as MarketingPeriod) : "30d";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive `[from, to]` dates (YYYY-MM-DD, UTC) ending today. */
export function periodWindow(period: MarketingPeriod, now: Date = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (DAYS[period] - 1));
  return { from: isoDate(from), to: isoDate(to) };
}

/** The month grid a content calendar shows: `YYYY-MM` in, first/last day out. */
export function monthWindow(raw: string | string[] | undefined, now: Date = new Date()): {
  month: string;
  from: string;
  to: string;
  previous: string;
  next: string;
} {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  let year = now.getUTCFullYear();
  let monthIndex = now.getUTCMonth();
  if (match) {
    const m = Number(match[2]);
    if (m >= 1 && m <= 12) {
      year = Number(match[1]);
      monthIndex = m - 1;
    }
  }
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const ym = (d: Date) => isoDate(d).slice(0, 7);
  return { month: ym(first), from: isoDate(first), to: isoDate(last), previous: ym(prev), next: ym(next) };
}

/** Buckets a date into the start of its day, ISO week (Monday) or month, for time series. */
export function bucketStart(date: string, grain: "day" | "week" | "month"): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (grain === "month") return `${date.slice(0, 7)}-01`;
  if (grain === "week") {
    const offset = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - offset);
  }
  return isoDate(d);
}
