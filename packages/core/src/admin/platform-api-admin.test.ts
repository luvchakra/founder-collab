import { describe, expect, it } from "vitest";
import { summarizeApiUsage } from "./platform-api-admin";

/** PLATFORM-P1-06.4 -- the API usage dashboard's aggregation. */
describe("summarizeApiUsage", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("totals requests per day and per business across seven days", () => {
    const summary = summarizeApiUsage(
      [
        { day: "2026-10-10", business_id: "a", requests: 100, rate_limited: 3 },
        { day: "2026-10-09", business_id: "a", requests: 50, rate_limited: 0 },
        { day: "2026-10-10", business_id: "b", requests: 10, rate_limited: 0 },
      ],
      [],
      now,
    );
    expect(summary.requests24h).toBe(110);
    expect(summary.requests7d).toBe(160);
    expect(summary.rateLimited7d).toBe(3);
    expect(summary.daily).toHaveLength(7);
    expect(summary.daily.at(-1)).toEqual({ day: "2026-10-10", requests: 110 });
    expect(summary.byBusiness.get("a")).toBe(150);
  });

  it("splits errors into client and server, and the last 24 hours", () => {
    const summary = summarizeApiUsage(
      [],
      [
        { hour: "2026-10-10T10:00:00Z", status_code: 429, error_count: 4 },
        { hour: "2026-10-10T11:00:00Z", status_code: 500, error_count: 1 },
        { hour: "2026-10-05T11:00:00Z", status_code: 401, error_count: 2 },
      ],
      now,
    );
    expect(summary.errors24h).toEqual({ clientErrors: 4, serverErrors: 1 });
    expect(summary.errors7d).toEqual({ clientErrors: 6, serverErrors: 1 });
    expect(summary.errorsByStatus7d[0]).toEqual({ status: 429, count: 4 });
  });
});
