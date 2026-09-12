/**
 * COMPLY-P1-01.6 (Country-Specific E-Invoicing): "Country adapters must be independent."
 * Poland's own e-invoicing (KSeF) mandate types -- independent of `lib/einvoicing-de/`,
 * `lib/einvoicing-fr/`, `lib/einvoicing-be/`. KSeF is Poland's own national CLEARANCE
 * platform (a real government API, structurally closer to India's own IRP than to
 * Germany's decentralized exchange or Belgium's Peppol four-corner model), and its own
 * three-tier PLN-turnover-plus-micro-entrepreneur-carveout gating is its own distinct
 * shape, not shared with Germany's single-threshold gate.
 */

export type PlEinvoicingMandatePhase = {
  key: "issuance_large_taxpayers" | "issuance_other_vat_registered" | "issuance_micro_entrepreneurs";
  effectiveFrom: string;
  scope: string;
  description: string;
  thresholdPln?: number;
};

export type PlEinvoicingMandateSchedule = {
  format: string;
  phases: PlEinvoicingMandatePhase[];
  enforcementNote?: string;
};

/** Caller-DECLARED facts (backlog rule 12) -- this platform has no Polish turnover
 * classification or micro-entrepreneur registration status of its own to derive these
 * from. */
export type PlEinvoicingBusinessProfile = {
  turnoverPln: number | null;
  isMicroEntrepreneur: boolean | null;
};

export type PlEinvoicingSubmitRequest = {
  invoiceId: string;
  nip: string;
  ksefXmlPayload: string;
};

export type PlEinvoicingSubmitResponse = {
  ksefReferenceNumber: string | null;
  status: string;
  raw: Record<string, unknown>;
};

/** KSeF is a real government clearance API (submit + a reference number back), closer in
 * shape to `IrpAdapter` than to the other three EU country adapters in this story -- but
 * still its own independent interface, not literally `IrpAdapter` reused, since KSeF's own
 * request/response fields (NIP, a KSeF reference number) are genuinely Polish-specific. */
export interface PlEinvoicingAdapter {
  submit(request: PlEinvoicingSubmitRequest): Promise<PlEinvoicingSubmitResponse>;
}
