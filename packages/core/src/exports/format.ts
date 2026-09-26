import type { ExportColumnType } from "./types";

/**
 * EXP-PLAT-02/03 -- the value rules both writers share, so a CSV and an Excel file of
 * the same dataset can never disagree about what a cell says (§10, §40-§43).
 */

/**
 * CSV/Excel formula injection (§11, §52). A text cell a spreadsheet would read as a
 * formula -- `=HYPERLINK(...)`, `+cmd`, `@SUM(...)`, or one led by a tab or carriage
 * return, which some spreadsheets strip before parsing -- gets a leading apostrophe, the
 * spreadsheet convention for "this is text". A leading `-` is only a risk when the rest
 * isn't a plain number: `-100` is left alone, `-2+3` and `-cmd|...` are not.
 *
 * Applies to text only. A value typed as a number never reaches this function, so a
 * negative amount can never be turned into text by it.
 */
export function neutralizeFormula(text: string): string {
  if (text === "") return text;
  const first = text[0];
  if (first === "=" || first === "+" || first === "@" || first === "\t" || first === "\r") return `'${text}`;
  if (first === "-" && !/^-\d+(\.\d+)?$/.test(text)) return `'${text}`;
  return text;
}

/** Wall-clock parts of an instant in a time zone -- what the business saw on its clock. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** `+05:30` -- the zone's offset from UTC at that instant. */
function offsetFor(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const minutes = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** A plain calendar date: a `YYYY-MM-DD` string stays exactly that day (no time zone is
 * applied to a date that has none); anything else is read as an instant and shown as the
 * business's local day. */
export function toDateOnly(value: unknown, timeZone: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** An instant, as ISO 8601 in the business's zone with its offset --
 * `2026-09-26T10:30:00+05:30` (§40). */
export function toZonedIso(value: unknown, timeZone: string): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${offsetFor(date, timeZone)}`;
}

/** A number, or null when the value isn't one. A blank stays blank -- never zero (§46:
 * an unreported figure is not a reported zero). */
export function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Text for anything that isn't one of the typed kinds: arrays joined predictably,
 * objects as JSON (never `[object Object]`), null as blank (never `"undefined"`). */
export function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toText(item)).filter((item) => item !== "").join("; ");
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** A value as the text a CSV cell carries (§10): raw numbers, `Yes`/`No`, ISO dates. */
export function toCsvText(value: unknown, type: ExportColumnType, timeZone: string): string {
  switch (type) {
    case "number":
    case "integer":
    case "currency":
    case "percent": {
      const n = toNumber(value);
      return n == null ? "" : String(n);
    }
    case "boolean":
      return value == null || value === "" ? "" : value ? "Yes" : "No";
    case "date":
      return toDateOnly(value, timeZone) ?? "";
    case "datetime":
      return toZonedIso(value, timeZone) ?? "";
    default:
      return neutralizeFormula(toText(value));
  }
}
