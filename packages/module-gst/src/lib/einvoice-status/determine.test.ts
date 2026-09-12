import { describe, expect, it } from "vitest";
import { determineEinvoiceStatus } from "./determine";

describe("determineEinvoiceStatus", () => {
  it("is cancelled when the einvoices row is cancelled, regardless of mandate/deadline", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: "cancelled", mandated: false, deadlineStatus: "deadline_breached" });
    expect(result.status).toBe("cancelled");
  });

  it("is accepted when the einvoices row is generated, even if mandate later reads false", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: "generated", mandated: false, deadlineStatus: "not_restricted" });
    expect(result.status).toBe("accepted");
  });

  it("is accepted when generated, even if the deadline has since been breached", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: "generated", mandated: true, deadlineStatus: "deadline_breached" });
    expect(result.status).toBe("accepted");
  });

  it("is not_applicable when there is no row and the business is not mandated", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: false, deadlineStatus: "not_restricted" });
    expect(result.status).toBe("not_applicable");
  });

  it("is deadline_breached when there is no row, mandate is true, and the reporting window closed", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: true, deadlineStatus: "deadline_breached" });
    expect(result.status).toBe("deadline_breached");
  });

  it("is deadline_breached even when mandate is unknown (null), not smoothed into ready", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: null, deadlineStatus: "deadline_breached" });
    expect(result.status).toBe("deadline_breached");
  });

  it("is ready when there is no row, mandated true, and still within the reporting window", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: true, deadlineStatus: "within_window" });
    expect(result.status).toBe("ready");
  });

  it("is ready when there is no row, mandated true, and no reporting-window restriction applies", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: true, deadlineStatus: "not_restricted" });
    expect(result.status).toBe("ready");
  });

  it("is ready (never blocked speculatively) when mandate is unknown and deadline is unknown", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: null, deadlineStatus: "unknown" });
    expect(result.status).toBe("ready");
  });

  it("surfaces the underlying facts alongside the derived status", () => {
    const result = determineEinvoiceStatus({ einvoiceRowStatus: null, mandated: true, deadlineStatus: "within_window" });
    expect(result.mandated).toBe(true);
    expect(result.deadlineStatus).toBe("within_window");
    expect(result.einvoiceRowStatus).toBeNull();
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
