import { describe, expect, it } from "vitest";
import { determineActivePlEinvoicingPhases, parsePlEinvoicingMandateSchedule } from "./mandate";
import type { PlEinvoicingMandateSchedule } from "./types";

const SCHEDULE: PlEinvoicingMandateSchedule = {
  format: "KSeF",
  phases: [
    { key: "issuance_large_taxpayers", effectiveFrom: "2026-02-01", scope: "turnover_over_pln_200000000", description: "Large taxpayers", thresholdPln: 200000000 },
    { key: "issuance_other_vat_registered", effectiveFrom: "2026-04-01", scope: "vat_registered_excl_micro", description: "Other VAT-registered" },
    { key: "issuance_micro_entrepreneurs", effectiveFrom: "2027-01-01", scope: "micro_entrepreneurs", description: "Micro-entrepreneurs" },
  ],
};

describe("parsePlEinvoicingMandateSchedule", () => {
  it("parses a well-formed schedule including thresholdPln", () => {
    const parsed = parsePlEinvoicingMandateSchedule(SCHEDULE as unknown as Record<string, unknown>);
    expect(parsed?.phases[0]?.thresholdPln).toBe(200000000);
  });
});

describe("determineActivePlEinvoicingPhases", () => {
  it("a large taxpayer (turnover over threshold) is obligated from 1-Feb-2026", () => {
    const result = determineActivePlEinvoicingPhases(SCHEDULE, "2026-02-01", { turnoverPln: 250000000, isMicroEntrepreneur: false });
    expect(result.find((r) => r.phase.key === "issuance_large_taxpayers")?.applies).toBe(true);
  });

  it("a non-large, non-micro business is NOT yet obligated on 1-Feb-2026 but IS from 1-Apr-2026", () => {
    const feb = determineActivePlEinvoicingPhases(SCHEDULE, "2026-02-01", { turnoverPln: 1000000, isMicroEntrepreneur: false });
    expect(feb.find((r) => r.phase.key === "issuance_large_taxpayers")?.applies).toBe(false);
    expect(feb.find((r) => r.phase.key === "issuance_other_vat_registered")?.applies).toBe(false); // date not reached

    const apr = determineActivePlEinvoicingPhases(SCHEDULE, "2026-04-01", { turnoverPln: 1000000, isMicroEntrepreneur: false });
    expect(apr.find((r) => r.phase.key === "issuance_other_vat_registered")?.applies).toBe(true);
  });

  it("a micro-entrepreneur is excluded from issuance_other_vat_registered but obligated from 1-Jan-2027 under its own phase", () => {
    const apr2026 = determineActivePlEinvoicingPhases(SCHEDULE, "2026-04-01", { turnoverPln: 50000, isMicroEntrepreneur: true });
    expect(apr2026.find((r) => r.phase.key === "issuance_other_vat_registered")?.applies).toBe(false);
    expect(apr2026.find((r) => r.phase.key === "issuance_micro_entrepreneurs")?.applies).toBe(false); // date not reached

    const jan2027 = determineActivePlEinvoicingPhases(SCHEDULE, "2027-01-01", { turnoverPln: 50000, isMicroEntrepreneur: true });
    expect(jan2027.find((r) => r.phase.key === "issuance_micro_entrepreneurs")?.applies).toBe(true);
  });

  it("a large taxpayer legitimately shows true for both issuance_large_taxpayers and issuance_other_vat_registered once both dates pass", () => {
    const result = determineActivePlEinvoicingPhases(SCHEDULE, "2026-04-01", { turnoverPln: 250000000, isMicroEntrepreneur: false });
    expect(result.find((r) => r.phase.key === "issuance_large_taxpayers")?.applies).toBe(true);
    expect(result.find((r) => r.phase.key === "issuance_other_vat_registered")?.applies).toBe(true);
  });

  it("returns applies: null when the needed fact is unknown, never silently false", () => {
    const unknownTurnover = determineActivePlEinvoicingPhases(SCHEDULE, "2026-02-01", { turnoverPln: null, isMicroEntrepreneur: false });
    expect(unknownTurnover.find((r) => r.phase.key === "issuance_large_taxpayers")?.applies).toBeNull();

    const unknownMicro = determineActivePlEinvoicingPhases(SCHEDULE, "2026-04-01", { turnoverPln: 1000000, isMicroEntrepreneur: null });
    expect(unknownMicro.find((r) => r.phase.key === "issuance_other_vat_registered")?.applies).toBeNull();
    expect(unknownMicro.find((r) => r.phase.key === "issuance_micro_entrepreneurs")?.applies).toBe(false); // date not reached regardless
  });
});
