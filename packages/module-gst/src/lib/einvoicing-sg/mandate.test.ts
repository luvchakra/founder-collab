import { describe, expect, it } from "vitest";
import { determineActiveSgInvoiceNowPhases, parseSgInvoiceNowMandateSchedule, SG_INVOICENOW_MANDATE_SCHEDULE_RULE } from "./mandate";
import type { SgInvoiceNowMandateSchedule } from "./types";

const SCHEDULE: SgInvoiceNowMandateSchedule = {
  format: "Peppol BIS Billing 3.0",
  phases: [
    { key: "soft_launch", effectiveFrom: "2025-05-01", scope: "voluntary_early_adoption", description: "Soft launch." },
    {
      key: "new_voluntary_registrants_recent_incorporation",
      effectiveFrom: "2025-11-01",
      scope: "voluntary_registrants_incorporated_within_6_months",
      description: "Newly incorporated voluntary registrants.",
    },
    { key: "all_new_voluntary_registrants", effectiveFrom: "2026-04-01", scope: "all_voluntary_registrants", description: "All voluntary registrants." },
    {
      key: "all_gst_registered_businesses",
      effectiveFrom: "2028-04-01",
      scope: "all_gst_registered_businesses_phased_through_2031",
      description: "All GST-registered businesses, phased.",
    },
  ],
};

describe("SG_INVOICENOW_MANDATE_SCHEDULE_RULE lineage", () => {
  it("is SG/GST with no jurisdiction", () => {
    expect(SG_INVOICENOW_MANDATE_SCHEDULE_RULE).toEqual({ country: "SG", jurisdiction: null, regime: "GST", ruleKey: "invoicenow_mandate_schedule" });
  });
});

describe("parseSgInvoiceNowMandateSchedule", () => {
  it("parses a valid schedule", () => {
    expect(parseSgInvoiceNowMandateSchedule(SCHEDULE as unknown as Record<string, unknown>)).toEqual(SCHEDULE);
  });

  it("rejects a missing/empty phases array", () => {
    expect(parseSgInvoiceNowMandateSchedule({ format: "x" })).toBeNull();
    expect(parseSgInvoiceNowMandateSchedule({ format: "x", phases: [] })).toBeNull();
  });

  it("rejects a malformed phase entry", () => {
    expect(parseSgInvoiceNowMandateSchedule({ format: "x", phases: [{ key: "soft_launch" }] })).toBeNull();
  });
});

describe("determineActiveSgInvoiceNowPhases", () => {
  it("before soft launch, every phase is false", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-01-01", {
      registrationBasis: "voluntary",
      incorporationDate: "2024-12-01",
      gstRegistrationDate: "2024-12-15",
    });
    expect(result.every((r) => r.applies === false)).toBe(true);
  });

  it("soft_launch applies once its own date passes, regardless of profile", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-06-01", {
      registrationBasis: null,
      incorporationDate: null,
      gstRegistrationDate: null,
    });
    expect(result.find((r) => r.phase.key === "soft_launch")?.applies).toBe(true);
  });

  it("new_voluntary_registrants_recent_incorporation applies for a voluntary registrant incorporated within 6 months of GST registration, once its own date passes", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-12-01", {
      registrationBasis: "voluntary",
      incorporationDate: "2025-09-01",
      gstRegistrationDate: "2025-11-15",
    });
    expect(result.find((r) => r.phase.key === "new_voluntary_registrants_recent_incorporation")?.applies).toBe(true);
  });

  it("new_voluntary_registrants_recent_incorporation does not apply when incorporation was more than 6 months before GST registration", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-12-01", {
      registrationBasis: "voluntary",
      incorporationDate: "2024-01-01",
      gstRegistrationDate: "2025-11-15",
    });
    expect(result.find((r) => r.phase.key === "new_voluntary_registrants_recent_incorporation")?.applies).toBe(false);
  });

  it("new_voluntary_registrants_recent_incorporation is false (not unknown) for a compulsory registrant", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-12-01", {
      registrationBasis: "compulsory",
      incorporationDate: "2025-09-01",
      gstRegistrationDate: "2025-11-15",
    });
    expect(result.find((r) => r.phase.key === "new_voluntary_registrants_recent_incorporation")?.applies).toBe(false);
  });

  it("new_voluntary_registrants_recent_incorporation is unknown when the registration basis or dates are unknown, once its own date has passed", () => {
    const unknownBasis = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-12-01", {
      registrationBasis: null,
      incorporationDate: "2025-09-01",
      gstRegistrationDate: "2025-11-15",
    });
    expect(unknownBasis.find((r) => r.phase.key === "new_voluntary_registrants_recent_incorporation")?.applies).toBeNull();

    const unknownDates = determineActiveSgInvoiceNowPhases(SCHEDULE, "2025-12-01", {
      registrationBasis: "voluntary",
      incorporationDate: null,
      gstRegistrationDate: null,
    });
    expect(unknownDates.find((r) => r.phase.key === "new_voluntary_registrants_recent_incorporation")?.applies).toBeNull();
  });

  it("all_new_voluntary_registrants applies to any voluntary registrant once its own date passes, unknown for an unknown basis", () => {
    const voluntary = determineActiveSgInvoiceNowPhases(SCHEDULE, "2026-05-01", {
      registrationBasis: "voluntary",
      incorporationDate: "2010-01-01",
      gstRegistrationDate: "2026-04-15",
    });
    expect(voluntary.find((r) => r.phase.key === "all_new_voluntary_registrants")?.applies).toBe(true);

    const compulsory = determineActiveSgInvoiceNowPhases(SCHEDULE, "2026-05-01", {
      registrationBasis: "compulsory",
      incorporationDate: null,
      gstRegistrationDate: null,
    });
    expect(compulsory.find((r) => r.phase.key === "all_new_voluntary_registrants")?.applies).toBe(false);

    const unknown = determineActiveSgInvoiceNowPhases(SCHEDULE, "2026-05-01", {
      registrationBasis: null,
      incorporationDate: null,
      gstRegistrationDate: null,
    });
    expect(unknown.find((r) => r.phase.key === "all_new_voluntary_registrants")?.applies).toBeNull();
  });

  it("all_gst_registered_businesses is unknown (never false or true) for every business once its own window opens", () => {
    const result = determineActiveSgInvoiceNowPhases(SCHEDULE, "2029-01-01", {
      registrationBasis: "compulsory",
      incorporationDate: null,
      gstRegistrationDate: null,
    });
    expect(result.find((r) => r.phase.key === "all_gst_registered_businesses")?.applies).toBeNull();
  });
});
