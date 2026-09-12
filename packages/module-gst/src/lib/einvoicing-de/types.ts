/**
 * COMPLY-P1-01.6 (Country-Specific E-Invoicing): "Country adapters must be independent."
 * Germany's own e-invoicing mandate types -- deliberately not shared with
 * `lib/einvoicing-fr/`, `lib/einvoicing-be/`, or `lib/einvoicing-pl/` even where the shape
 * looks similar; each country pack owns its own types, matching how India's own
 * `IrpAdapter`/`EwayBillAdapter` (COMPLY-P0-05.3/06.3) are two independent interfaces
 * rather than one shared "government adapter" abstraction.
 */

export type DeEinvoicingMandatePhase = {
  key: "reception_all" | "issuance_large" | "issuance_all";
  effectiveFrom: string;
  scope: string;
  description: string;
  thresholdEur?: number;
};

export type DeEinvoicingMandateSchedule = {
  format: string;
  phases: DeEinvoicingMandatePhase[];
};

/** What a caller must declare about the business to know which phases actually apply --
 * `priorYearTurnoverEur` is a caller-DECLARED fact (backlog rule 12), the same
 * "self-declared, not computed" posture COMPLY-P0-04.2's own `eInvoiceEligible` flag
 * already takes for India's own turnover-gated e-invoice mandate. */
export type DeEinvoicingBusinessProfile = {
  priorYearTurnoverEur: number | null;
};

export type DeEinvoicingSubmitRequest = {
  invoiceId: string;
  buyerLeitwegId: string | null;
  xmlPayload: string;
};

export type DeEinvoicingSubmitResponse = {
  transmissionId: string | null;
  status: string;
  raw: Record<string, unknown>;
};

/** Germany's own e-invoicing exchange is genuinely decentralized (direct exchange or via
 * Peppol) -- there is no single national clearance PORTAL the way Poland's KSeF or the
 * old-style clearance models are, so this adapter's own "submit" is deliberately a
 * transmission-confirmation contract, not a government clearance/approval call the way
 * `IrpAdapter.submit` is for India's own IRP. */
export interface DeEinvoicingAdapter {
  submit(request: DeEinvoicingSubmitRequest): Promise<DeEinvoicingSubmitResponse>;
}
