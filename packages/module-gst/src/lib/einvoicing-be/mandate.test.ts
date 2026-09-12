import { describe, expect, it } from "vitest";
import { determineActiveBeEinvoicingPhases, parseBeEinvoicingMandateSchedule } from "./mandate";
import type { BeEinvoicingMandateSchedule } from "./types";

const SCHEDULE: BeEinvoicingMandateSchedule = {
  format: "Peppol / EN 16931",
  phases: [
    { key: "b2b_mandatory", effectiveFrom: "2026-01-01", scope: "all_vat_registered_businesses", description: "B2B mandatory" },
    { key: "e_reporting", effectiveFrom: "2028-01-01", scope: "all_vat_registered_businesses", description: "E-reporting" },
  ],
};

describe("parseBeEinvoicingMandateSchedule", () => {
  it("parses a well-formed schedule with an optional toleranceNote", () => {
    const parsed = parseBeEinvoicingMandateSchedule({ ...SCHEDULE, toleranceNote: "Q1 2026 tolerance" } as unknown as Record<string, unknown>);
    expect(parsed?.phases).toHaveLength(2);
    expect(parsed?.toleranceNote).toBe("Q1 2026 tolerance");
  });
});

describe("determineActiveBeEinvoicingPhases", () => {
  it("returns null for every phase when VAT registration in Belgium is unknown", () => {
    const result = determineActiveBeEinvoicingPhases(SCHEDULE, "2026-06-01", { isVatRegisteredInBelgium: null });
    expect(result.every((r) => r.applies === null)).toBe(true);
  });

  it("returns false for every phase when the business is not VAT-registered in Belgium", () => {
    const result = determineActiveBeEinvoicingPhases(SCHEDULE, "2026-06-01", { isVatRegisteredInBelgium: false });
    expect(result.every((r) => r.applies === false)).toBe(true);
  });

  it("applies b2b_mandatory (not e_reporting) once VAT-registered and the date has passed", () => {
    const result = determineActiveBeEinvoicingPhases(SCHEDULE, "2026-06-01", { isVatRegisteredInBelgium: true });
    expect(result.find((r) => r.phase.key === "b2b_mandatory")?.applies).toBe(true);
    expect(result.find((r) => r.phase.key === "e_reporting")?.applies).toBe(false);
  });

  it("applies both phases once both dates have passed", () => {
    const result = determineActiveBeEinvoicingPhases(SCHEDULE, "2028-01-01", { isVatRegisteredInBelgium: true });
    expect(result.every((r) => r.applies === true)).toBe(true);
  });
});
