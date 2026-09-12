import { describe, expect, it } from "vitest";
import { buildModuleEntitlementDecision, buildPlatformDisabledDecision } from "./module-entitlement";

describe("buildModuleEntitlementDecision (PLATFORM-P0-05.1)", () => {
  it("is allowed, source license, when the license is fully active", () => {
    const decision = buildModuleEntitlementDecision("fsm", true, true);
    expect(decision).toEqual({
      allowed: true,
      reason: "Service is licensed and active.",
      source: "license",
      limit: null,
      usage: null,
      remaining: null,
    });
  });

  it("is not allowed, with a grace-period reason, when read-only grace applies", () => {
    const decision = buildModuleEntitlementDecision("fsm", true, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Service's license is in its read-only grace period.");
    expect(decision.source).toBe("license");
  });

  it("is not allowed, with an unlicensed reason, when there is no license at all", () => {
    const decision = buildModuleEntitlementDecision("fsm", false, false);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("Service is not licensed for this business.");
  });

  it("falls back to the raw module key when the key is not in the registry", () => {
    const decision = buildModuleEntitlementDecision("not-a-real-module", false, false);
    expect(decision.reason).toBe("not-a-real-module is not licensed for this business.");
  });

  it("always returns null limit/usage/remaining -- a module check is not a quantity", () => {
    for (const [read, write] of [
      [true, true],
      [true, false],
      [false, false],
    ] as const) {
      const decision = buildModuleEntitlementDecision("gst", read, write);
      expect(decision.limit).toBeNull();
      expect(decision.usage).toBeNull();
      expect(decision.remaining).toBeNull();
    }
  });

  it("never reports both writeAllowed=false, readAllowed=true as fully allowed", () => {
    // A degraded (grace) license must never present as an unqualified "allowed: true" --
    // the whole point of preserving this state separately from "not licensed at all".
    const decision = buildModuleEntitlementDecision("crm", true, false);
    expect(decision.allowed).toBe(false);
  });

  describe("PLATFORM-P0-07.3 (decision #2) -- platform-wide read_only", () => {
    it("denies write with a platform_global reason when the license would otherwise allow it", () => {
      // readAllowed=true, writeAllowed=false (forced false by the caller because the
      // platform-wide status is read_only, even though the business's own license would
      // permit the write) -- this is the case the platformReadOnly flag exists for.
      const decision = buildModuleEntitlementDecision("fsm", true, false, true);
      expect(decision.allowed).toBe(false);
      expect(decision.source).toBe("platform_global");
      expect(decision.reason).toContain("read-only platform-wide");
    });

    it("uses the superadmin-set customer-facing message when one is set", () => {
      const decision = buildModuleEntitlementDecision("fsm", true, false, true, "We're migrating databases.");
      expect(decision.reason).toBe("We're migrating databases.");
    });

    it("still surfaces the business's own license reason when the business isn't licensed at all", () => {
      // readAllowed=false -- the business's own lack of a license is the more specific,
      // more helpful reason, even if the platform is also read-only right now.
      const decision = buildModuleEntitlementDecision("fsm", false, false, true);
      expect(decision.source).toBe("license");
      expect(decision.reason).toBe("Service is not licensed for this business.");
    });
  });
});

describe("buildPlatformDisabledDecision (PLATFORM-P0-07.2/07.3)", () => {
  it("is never allowed, source platform_global, for a disabled module", () => {
    const decision = buildPlatformDisabledDecision("fsm", "disabled");
    expect(decision).toEqual({
      allowed: false,
      reason: "Service has been temporarily disabled platform-wide by WonderArc.",
      source: "platform_global",
      limit: null,
      usage: null,
      remaining: null,
    });
  });

  it("is never allowed, with distinct default copy, for a module in maintenance (decision #3)", () => {
    const decision = buildPlatformDisabledDecision("fsm", "maintenance");
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe("platform_global");
    expect(decision.reason).toBe("Service is temporarily down for maintenance. We'll be back soon.");
  });

  it("uses the superadmin-set customer-facing message when one is set (decision #4)", () => {
    const decision = buildPlatformDisabledDecision("fsm", "disabled", "Back at 5pm IST.");
    expect(decision.reason).toBe("Back at 5pm IST.");
  });

  it("falls back to the raw module key when the key is not in the registry", () => {
    const decision = buildPlatformDisabledDecision("not-a-real-module", "disabled");
    expect(decision.reason).toBe("not-a-real-module has been temporarily disabled platform-wide by WonderArc.");
  });
});
