import { describe, expect, it } from "vitest";
import { determineRegistrationObligation } from "./obligations";

describe("determineRegistrationObligation", () => {
  it("is obligated when economic nexus alone is established", () => {
    const result = determineRegistrationObligation("CA", true, false);
    expect(result.obligated).toBe(true);
    expect(result.reason).toContain("economic nexus");
  });

  it("is obligated when physical nexus alone is established", () => {
    const result = determineRegistrationObligation("TX", false, true);
    expect(result.obligated).toBe(true);
    expect(result.reason).toContain("physical nexus");
  });

  it("is obligated when both are established", () => {
    const result = determineRegistrationObligation("NY", true, true);
    expect(result.obligated).toBe(true);
    expect(result.reason).toContain("economic nexus");
    expect(result.reason).toContain("physical nexus");
  });

  it("is not obligated only when BOTH are confirmed false", () => {
    const result = determineRegistrationObligation("FL", false, false);
    expect(result.obligated).toBe(false);
  });

  it("is unresolved (null) when one is unknown and neither known signal already proves it", () => {
    expect(determineRegistrationObligation("PA", null, false).obligated).toBeNull();
    expect(determineRegistrationObligation("PA", false, null).obligated).toBeNull();
    expect(determineRegistrationObligation("PA", null, null).obligated).toBeNull();
  });

  it("never reports null when a known true already settles it, even if the other signal is unknown", () => {
    expect(determineRegistrationObligation("OH", true, null).obligated).toBe(true);
    expect(determineRegistrationObligation("OH", null, true).obligated).toBe(true);
  });

  it("always echoes back the state and both raw signals", () => {
    const result = determineRegistrationObligation("GA", true, false);
    expect(result.state).toBe("GA");
    expect(result.economicNexus).toBe(true);
    expect(result.physicalNexus).toBe(false);
  });
});
