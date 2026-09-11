import { describe, expect, it } from "vitest";
import { ageBucket, median } from "./response-performance";

describe("median", () => {
  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("returns the middle value for an odd-length list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for an even-length list", () => {
    expect(median([10, 20])).toBe(15);
  });

  it("is unaffected by input order", () => {
    expect(median([100, 1, 50])).toBe(50);
  });
});

describe("ageBucket", () => {
  function hoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  }

  it("buckets something from 12 hours ago as 0-1 day", () => {
    expect(ageBucket(hoursAgo(12))).toBe("0-1 day");
  });

  it("buckets something from 2 days ago as 1-3 days", () => {
    expect(ageBucket(hoursAgo(48))).toBe("1-3 days");
  });

  it("buckets something from 5 days ago as 3-7 days", () => {
    expect(ageBucket(hoursAgo(5 * 24))).toBe("3-7 days");
  });

  it("buckets something from 10 days ago as 7+ days", () => {
    expect(ageBucket(hoursAgo(10 * 24))).toBe("7+ days");
  });
});
