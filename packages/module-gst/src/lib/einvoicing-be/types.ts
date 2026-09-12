/**
 * COMPLY-P1-01.6 (Country-Specific E-Invoicing): "Country adapters must be independent."
 * Belgium's own e-invoicing mandate types -- independent of `lib/einvoicing-de/`,
 * `lib/einvoicing-fr/`, `lib/einvoicing-pl/`. Belgium's own mandate has NO size/turnover
 * gating at all -- unlike Germany (turnover-gated) or France (company-size-gated), nearly
 * every Belgian VAT-registered business is in scope from the same date, so this country's
 * own eligibility check is genuinely simpler, not a stripped-down copy of the others.
 */

export type BeEinvoicingMandatePhase = {
  key: "b2b_mandatory" | "e_reporting";
  effectiveFrom: string;
  scope: string;
  description: string;
};

export type BeEinvoicingMandateSchedule = {
  format: string;
  phases: BeEinvoicingMandatePhase[];
  toleranceNote?: string;
};

/** Belgium's own mandate applies to essentially every VAT-registered business -- the one
 * real caller-declared fact this determination still needs is whether the business is
 * VAT-registered in Belgium at all (a business with no Belgian VAT registration is simply
 * out of scope, not "not yet mandated"). */
export type BeEinvoicingBusinessProfile = {
  isVatRegisteredInBelgium: boolean | null;
};

export type BeEinvoicingSubmitRequest = {
  invoiceId: string;
  peppolParticipantId: string;
  ublPayload: string;
};

export type BeEinvoicingSubmitResponse = {
  transmissionId: string | null;
  status: string;
  raw: Record<string, unknown>;
};

/** Belgium transmits via the Peppol network -- a real, standardized four-corner model
 * (access points, not a single government clearance API the way Poland's KSeF is), its own
 * distinct shape from both Germany's decentralized exchange and France's PDP/PPF model. */
export interface BeEinvoicingAdapter {
  submit(request: BeEinvoicingSubmitRequest): Promise<BeEinvoicingSubmitResponse>;
}
