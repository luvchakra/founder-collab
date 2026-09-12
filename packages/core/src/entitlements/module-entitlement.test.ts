import { describe, expect, it } from "vitest";
import { buildModuleEntitlementDecision } from "./module-entitlement";

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
});
