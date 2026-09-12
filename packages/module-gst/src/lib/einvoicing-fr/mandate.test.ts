import { describe, expect, it } from "vitest";
import { determineActiveFrEinvoicingPhases, parseFrEinvoicingMandateSchedule } from "./mandate";
import type { FrEinvoicingMandateSchedule } from "./types";

const SCHEDULE: FrEinvoicingMandateSchedule = {
  format: "Factur-X/UBL/CII via PDP or PPF",
  phases: [
    { key: "reception_all", effectiveFrom: "2026-09-01", scope: "all_businesses", description: "Receive" },
    { key: "issuance_large_mid", effectiveFrom: "2026-09-01", scope: "large_and_mid_sized", description: "Issue (GE/ETI)" },
    { key: "issuance_small", effectiveFrom: "2027-09-01", scope: "small_and_micro", description: "Issue (PME/TPE)" },
  ],
};

describe("parseFrEinvoicingMandateSchedule", () => {
  it("parses a well-formed schedule with an optional enforcementNote", () => {
    const parsed = parseFrEinvoicingMandateSchedule({ ...SCHEDULE, enforcementNote: "soft enforcement" } as unknown as Record<string, unknown>);
    expect(parsed?.phases).toHaveLength(3);
    expect(parsed?.enforcementNote).toBe("soft enforcement");
  });

  it("returns null when phases is missing or empty", () => {
    expect(parseFrEinvoicingMandateSchedule({ format: "x", phases: [] })).toBeNull();
  });
});

describe("determineActiveFrEinvoicingPhases", () => {
  it("before 1-Sep-2026: nothing is active", () => {
    const result = determineActiveFrEinvoicingPhases(SCHEDULE, "2026-08-31", { companySize: "GE" });
    expect(result.every((r) => r.applies === false)).toBe(true);
  });

  it("from 1-Sep-2026: reception applies to everyone, issuance_large_mid only to GE/ETI", () => {
    const ge = determineActiveFrEinvoicingPhases(SCHEDULE, "2026-09-01", { companySize: "GE" });
    expect(ge.find((r) => r.phase.key === "reception_all")?.applies).toBe(true);
    expect(ge.find((r) => r.phase.key === "issuance_large_mid")?.applies).toBe(true);
    expect(ge.find((r) => r.phase.key === "issuance_small")?.applies).toBe(false); // date not reached yet

    const pme = determineActiveFrEinvoicingPhases(SCHEDULE, "2026-09-01", { companySize: "PME" });
    expect(pme.find((r) => r.phase.key === "issuance_large_mid")?.applies).toBe(false);
  });

  it("from 1-Sep-2027: issuance_small applies to PME/TPE", () => {
    const result = determineActiveFrEinvoicingPhases(SCHEDULE, "2027-09-01", { companySize: "TPE" });
    expect(result.find((r) => r.phase.key === "issuance_small")?.applies).toBe(true);
  });

  it("returns applies: null for both issuance phases when companySize is unknown -- never understate", () => {
    const result = determineActiveFrEinvoicingPhases(SCHEDULE, "2027-09-01", { companySize: null });
    expect(result.find((r) => r.phase.key === "issuance_large_mid")?.applies).toBeNull();
    expect(result.find((r) => r.phase.key === "issuance_small")?.applies).toBeNull();
    expect(result.find((r) => r.phase.key === "reception_all")?.applies).toBe(true); // unaffected by company size
  });
});
