import { describe, expect, it } from "vitest";
import { determineSgInvoiceNowTransmissionStatus } from "./transmission-status";

describe("determineSgInvoiceNowTransmissionStatus", () => {
  it("reflects an already-sent transmission's own status regardless of whether it is required", () => {
    expect(determineSgInvoiceNowTransmissionStatus({ required: false, transmissionRowStatus: "delivered" })).toEqual({
      required: false,
      transmissionStatus: "delivered",
      reason: "This document has already been transmitted via InvoiceNow (status: delivered).",
    });
  });

  it("reports required and not yet sent when a mandate phase applies and nothing has been sent", () => {
    const result = determineSgInvoiceNowTransmissionStatus({ required: true, transmissionRowStatus: null });
    expect(result).toEqual({
      required: true,
      transmissionStatus: "not_sent",
      reason: "InvoiceNow transmission is required for this business under a currently-effective mandate phase, and has not yet been sent for this document.",
    });
  });

  it("reports not required when no mandate phase applies and nothing has been sent", () => {
    const result = determineSgInvoiceNowTransmissionStatus({ required: false, transmissionRowStatus: null });
    expect(result.required).toBe(false);
    expect(result.transmissionStatus).toBe("not_sent");
  });

  it("reports unknown (never false) when required-ness itself could not be determined and nothing has been sent", () => {
    const result = determineSgInvoiceNowTransmissionStatus({ required: null, transmissionRowStatus: null });
    expect(result.required).toBeNull();
    expect(result.transmissionStatus).toBe("not_sent");
  });
});
