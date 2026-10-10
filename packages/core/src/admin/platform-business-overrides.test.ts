import { describe, expect, it } from "vitest";
import { overrideStatus } from "./platform-business-overrides-status";
import { createBusinessOverrideSchema } from "./platform-business-overrides";

// PLATFORM-P1-02.1/02.2: the window an override is in, and what the form accepts.
describe("overrideStatus", () => {
  const now = Date.parse("2026-10-10T12:00:00Z");
  it("is scheduled before it starts, active inside its window, expired after", () => {
    expect(overrideStatus("2026-10-11T00:00:00Z", "2026-11-01T00:00:00Z", null, now)).toBe("scheduled");
    expect(overrideStatus("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", null, now)).toBe("active");
    expect(overrideStatus("2026-09-01T00:00:00Z", "2026-10-10T12:00:00Z", null, now)).toBe("expired");
  });
  it("is revoked once revoked, whatever its window", () => {
    expect(overrideStatus("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", "2026-10-05T00:00:00Z", now)).toBe("revoked");
  });
});

describe("createBusinessOverrideSchema", () => {
  const base = {
    businessId: "11111111-1111-4111-8111-111111111111",
    resourceKey: "prospects",
    state: "limited",
    limitValue: "500",
    startsOn: null,
    expiresOn: "2026-11-09",
    reason: "Enterprise pilot",
  } as const;

  it("accepts a limited override with a reason and expiry", () => {
    const parsed = createBusinessOverrideSchema.parse(base);
    expect(parsed.limitValue).toBe(500);
  });
  it("requires a limit for a limited override, but not for unlimited", () => {
    expect(createBusinessOverrideSchema.safeParse({ ...base, limitValue: null }).success).toBe(false);
    expect(createBusinessOverrideSchema.safeParse({ ...base, state: "unlimited", limitValue: null }).success).toBe(true);
  });
  it("requires a reason and an expiry after the start", () => {
    expect(createBusinessOverrideSchema.safeParse({ ...base, reason: "  " }).success).toBe(false);
    expect(createBusinessOverrideSchema.safeParse({ ...base, expiresOn: "" }).success).toBe(false);
    expect(createBusinessOverrideSchema.safeParse({ ...base, startsOn: "2026-11-09" }).success).toBe(false);
  });
  it("refuses an unknown resource", () => {
    expect(createBusinessOverrideSchema.safeParse({ ...base, resourceKey: "nope" }).success).toBe(false);
  });
});
