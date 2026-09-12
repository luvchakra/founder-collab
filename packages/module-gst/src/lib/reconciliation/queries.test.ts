import { describe, expect, it } from "vitest";
import { periodToDateRange } from "./queries";

describe("periodToDateRange", () => {
  it("returns the first and last calendar date of a 31-day month", () => {
    expect(periodToDateRange("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(periodToDateRange("2026-01")).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  it("handles February correctly, including a leap year", () => {
    expect(periodToDateRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodToDateRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("throws for a malformed period rather than silently guessing a range", () => {
    expect(() => periodToDateRange("092026")).toThrow(/not a valid return period/);
    expect(() => periodToDateRange("2026-9")).toThrow(/not a valid return period/);
  });
});
