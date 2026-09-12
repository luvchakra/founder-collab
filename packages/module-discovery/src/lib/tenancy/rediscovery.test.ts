import { describe, expect, it } from "vitest";
import { computeNextDiscoveryAt, isRediscoveryDue } from "./rediscovery";

describe("computeNextDiscoveryAt", () => {
  it("returns null when scheduling is off", () => {
    expect(computeNextDiscoveryAt("off", new Date("2026-09-12T10:30:00Z"))).toBeNull();
  });

  it("adds one day for a daily cadence", () => {
    const result = computeNextDiscoveryAt("daily", new Date("2026-09-12T10:30:00Z"));
    expect(result?.toISOString()).toBe("2026-09-13T10:30:00.000Z");
  });

  it("adds seven days for a weekly cadence", () => {
    const result = computeNextDiscoveryAt("weekly", new Date("2026-09-12T10:30:00Z"));
    expect(result?.toISOString()).toBe("2026-09-19T10:30:00.000Z");
  });
});

describe("isRediscoveryDue", () => {
  const now = new Date("2026-09-12T10:30:00Z");

  it("is never due when nothing is scheduled", () => {
    expect(isRediscoveryDue(null, now)).toBe(false);
  });

  it("is due once the scheduled time has passed", () => {
    expect(isRediscoveryDue("2026-09-12T09:00:00Z", now)).toBe(true);
  });

  it("is due exactly at the scheduled time", () => {
    expect(isRediscoveryDue("2026-09-12T10:30:00Z", now)).toBe(true);
  });

  it("is not yet due before the scheduled time", () => {
    expect(isRediscoveryDue("2026-09-13T00:00:00Z", now)).toBe(false);
  });
});
