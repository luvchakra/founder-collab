/** MKT-03/MKT-14. The window a marketing number covers is explicit and predictable. */
import { describe, expect, it } from "vitest";
import { bucketStart, monthWindow, parsePeriod, periodWindow } from "./period";

describe("parsePeriod", () => {
  it("accepts a known period and falls back to 30 days otherwise", () => {
    expect(parsePeriod("90d")).toBe("90d");
    expect(parsePeriod(["365d"])).toBe("365d");
    expect(parsePeriod("forever")).toBe("30d");
    expect(parsePeriod(undefined)).toBe("30d");
  });
});

describe("periodWindow", () => {
  it("is inclusive of today and spans exactly the period", () => {
    expect(periodWindow("30d", new Date("2026-09-25T15:00:00Z"))).toEqual({ from: "2026-08-27", to: "2026-09-25" });
  });
});

describe("monthWindow", () => {
  it("returns the month's first and last day and its neighbours", () => {
    expect(monthWindow("2026-02", new Date("2026-09-25T00:00:00Z"))).toEqual({
      month: "2026-02",
      from: "2026-02-01",
      to: "2026-02-28",
      previous: "2026-01",
      next: "2026-03",
    });
  });

  it("falls back to the current month for anything malformed", () => {
    expect(monthWindow("2026-13", new Date("2026-09-25T00:00:00Z")).month).toBe("2026-09");
    expect(monthWindow("x", new Date("2026-12-05T00:00:00Z")).next).toBe("2027-01");
  });
});

describe("bucketStart", () => {
  it("buckets by day, ISO week and month", () => {
    expect(bucketStart("2026-09-25", "day")).toBe("2026-09-25");
    // 2026-09-25 is a Friday; its week starts Monday 2026-09-21.
    expect(bucketStart("2026-09-25", "week")).toBe("2026-09-21");
    expect(bucketStart("2026-09-21", "week")).toBe("2026-09-21");
    expect(bucketStart("2026-09-25", "month")).toBe("2026-09-01");
  });
});
