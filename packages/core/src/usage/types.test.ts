import { describe, expect, it } from "vitest";
import { currentMonthPeriod, toUsageCounter } from "./types";

describe("currentMonthPeriod (PLATFORM-P0-06.1)", () => {
  it("formats as YYYY-MM in UTC", () => {
    expect(currentMonthPeriod(new Date("2026-09-12T08:00:00Z"))).toBe("2026-09");
  });

  it("pads single-digit months", () => {
    expect(currentMonthPeriod(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01");
  });

  it("uses UTC, not local time, near a month boundary", () => {
    // 2026-01-31T23:30 UTC is still January in UTC even if a local timezone west of UTC
    // would already show January 31 as a different local date -- this function must not
    // depend on the server's own local timezone.
    expect(currentMonthPeriod(new Date("2026-01-31T23:30:00Z"))).toBe("2026-01");
  });
});

describe("toUsageCounter (PLATFORM-P0-06.1)", () => {
  it("maps snake_case DB columns to camelCase", () => {
    const counter = toUsageCounter({
      id: "c1",
      business_id: "b1",
      resource_key: "prospects",
      period: "current",
      count: 5,
      updated_at: "2026-09-12T00:00:00Z",
    });
    expect(counter).toEqual({
      id: "c1",
      businessId: "b1",
      resourceKey: "prospects",
      period: "current",
      count: 5,
      updatedAt: "2026-09-12T00:00:00Z",
    });
  });
});
