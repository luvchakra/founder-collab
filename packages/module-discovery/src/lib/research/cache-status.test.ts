import { describe, expect, it } from "vitest";
import { computeResearchCacheStatus } from "./cache-status";

const NOW = new Date("2026-09-13T00:00:00.000Z");

describe("computeResearchCacheStatus", () => {
  it("reports not expired, with days remaining, well before expiry", () => {
    const status = computeResearchCacheStatus(
      { researched_at: "2026-09-01T00:00:00.000Z", expires_at: "2026-10-01T00:00:00.000Z" },
      NOW,
    );
    expect(status.isExpired).toBe(false);
    expect(status.ageDays).toBe(12);
    expect(status.daysUntilExpiry).toBe(18);
  });

  it("reports expired once expires_at has passed", () => {
    const status = computeResearchCacheStatus(
      { researched_at: "2026-08-01T00:00:00.000Z", expires_at: "2026-09-01T00:00:00.000Z" },
      NOW,
    );
    expect(status.isExpired).toBe(true);
    expect(status.daysUntilExpiry).toBeLessThanOrEqual(0);
  });

  it("treats the exact expiry instant as expired", () => {
    const status = computeResearchCacheStatus({ researched_at: "2026-09-01T00:00:00.000Z", expires_at: NOW.toISOString() }, NOW);
    expect(status.isExpired).toBe(true);
  });

  it("never guesses expired/not-expired when there is no expires_at on file", () => {
    const status = computeResearchCacheStatus({ researched_at: "2026-09-01T00:00:00.000Z", expires_at: null }, NOW);
    expect(status.isExpired).toBe(false);
    expect(status.daysUntilExpiry).toBeNull();
  });
});
