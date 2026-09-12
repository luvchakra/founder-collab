import { describe, expect, it } from "vitest";
import { determineActiveDeEinvoicingPhases, parseDeEinvoicingMandateSchedule } from "./mandate";
import type { DeEinvoicingMandateSchedule } from "./types";

const SCHEDULE: DeEinvoicingMandateSchedule = {
  format: "EN 16931 (XRechnung/ZUGFeRD)",
  phases: [
    { key: "reception_all", effectiveFrom: "2025-01-01", scope: "all_businesses", description: "Receive" },
    { key: "issuance_large", effectiveFrom: "2027-01-01", scope: "turnover_over_eur_800000", description: "Issue (large)", thresholdEur: 800000 },
    { key: "issuance_all", effectiveFrom: "2028-01-01", scope: "all_businesses", description: "Issue (all)" },
  ],
};

describe("parseDeEinvoicingMandateSchedule", () => {
  it("parses a well-formed schedule", () => {
    const parsed = parseDeEinvoicingMandateSchedule(SCHEDULE as unknown as Record<string, unknown>);
    expect(parsed?.phases).toHaveLength(3);
    expect(parsed?.phases[1]?.thresholdEur).toBe(800000);
  });

  it("returns null when phases is missing or empty", () => {
    expect(parseDeEinvoicingMandateSchedule({ format: "x" })).toBeNull();
    expect(parseDeEinvoicingMandateSchedule({ format: "x", phases: [] })).toBeNull();
  });

  it("returns null when a phase is malformed", () => {
    expect(parseDeEinvoicingMandateSchedule({ phases: [{ key: "reception_all" }] })).toBeNull();
  });
});

describe("determineActiveDeEinvoicingPhases", () => {
  it("before 2025: no phase is active", () => {
    const result = determineActiveDeEinvoicingPhases(SCHEDULE, "2024-12-31", { priorYearTurnoverEur: 1000000 });
    expect(result.every((r) => r.applies === false)).toBe(true);
  });

  it("between 2025 and 2027: only reception is active, regardless of turnover", () => {
    const result = determineActiveDeEinvoicingPhases(SCHEDULE, "2026-06-01", { priorYearTurnoverEur: 50000 });
    expect(result.find((r) => r.phase.key === "reception_all")?.applies).toBe(true);
    expect(result.find((r) => r.phase.key === "issuance_large")?.applies).toBe(false);
    expect(result.find((r) => r.phase.key === "issuance_all")?.applies).toBe(false);
  });

  it("from 2027: issuance_large applies only when turnover exceeds the threshold", () => {
    const overThreshold = determineActiveDeEinvoicingPhases(SCHEDULE, "2027-06-01", { priorYearTurnoverEur: 900000 });
    expect(overThreshold.find((r) => r.phase.key === "issuance_large")?.applies).toBe(true);

    const underThreshold = determineActiveDeEinvoicingPhases(SCHEDULE, "2027-06-01", { priorYearTurnoverEur: 500000 });
    expect(underThreshold.find((r) => r.phase.key === "issuance_large")?.applies).toBe(false);
  });

  it("returns applies: null (not false) for issuance_large when turnover is unknown -- never understate an obligation", () => {
    const result = determineActiveDeEinvoicingPhases(SCHEDULE, "2027-06-01", { priorYearTurnoverEur: null });
    expect(result.find((r) => r.phase.key === "issuance_large")?.applies).toBeNull();
  });

  it("from 2028: issuance_all applies to everyone regardless of turnover", () => {
    const result = determineActiveDeEinvoicingPhases(SCHEDULE, "2028-01-01", { priorYearTurnoverEur: null });
    expect(result.find((r) => r.phase.key === "issuance_all")?.applies).toBe(true);
  });
});
