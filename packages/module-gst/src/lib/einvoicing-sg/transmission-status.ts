import type { InvoiceNowTransmissionStatus } from "./types";

/**
 * COMPLY-P1-04.6 (Transmission Status): the pure combiner at the center of this story --
 * same "pure comparison, caller resolves every input" shape `determineEinvoiceStatus`
 * (COMPLY-P0-05.6) already established, applied to a genuinely simpler fact set (no
 * reporting-deadline concept exists for InvoiceNow the way COMPLY-P0-05.5's own 30-hour
 * IRP reporting window does -- Peppol transmission has no regulatory clock of its own to
 * race against).
 */
export type SgInvoiceNowTransmissionStatusResult = {
  /** `null` only when phase applicability itself is unknown (see
   * `determineActiveSgInvoiceNowPhases`'s own docstring for why that happens) -- never
   * guessed `false`. */
  required: boolean | null;
  transmissionStatus: InvoiceNowTransmissionStatus | "not_sent";
  reason: string;
};

export function determineSgInvoiceNowTransmissionStatus(input: {
  /** Whether ANY currently-effective InvoiceNow mandate phase applies to this business --
   * the caller (`queries.ts`) has already combined `determineActiveSgInvoiceNowPhases`'s
   * own per-phase results into one "is this document's own transmission required at
   * all" fact (`true` if any phase applies, `null` if none applies yet but at least one
   * is genuinely unknown, `false` only if every phase resolved and none applies). */
  required: boolean | null;
  transmissionRowStatus: InvoiceNowTransmissionStatus | null;
}): SgInvoiceNowTransmissionStatusResult {
  const transmissionStatus = input.transmissionRowStatus ?? "not_sent";

  if (transmissionStatus !== "not_sent") {
    return {
      required: input.required,
      transmissionStatus,
      reason: `This document has already been transmitted via InvoiceNow (status: ${transmissionStatus}).`,
    };
  }

  if (input.required === null) {
    return {
      required: null,
      transmissionStatus: "not_sent",
      reason: "Whether InvoiceNow transmission is required for this business could not be determined -- see the mandate phase details.",
    };
  }

  if (input.required) {
    return {
      required: true,
      transmissionStatus: "not_sent",
      reason: "InvoiceNow transmission is required for this business under a currently-effective mandate phase, and has not yet been sent for this document.",
    };
  }

  return {
    required: false,
    transmissionStatus: "not_sent",
    reason: "No currently-effective InvoiceNow mandate phase applies to this business; transmission has not been sent for this document.",
  };
}
