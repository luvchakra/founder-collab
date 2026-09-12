/**
 * COMPLY-P1-01.6 (Country-Specific E-Invoicing): "Country adapters must be independent."
 * France's own e-invoicing mandate types -- independent of `lib/einvoicing-de/`,
 * `lib/einvoicing-be/`, `lib/einvoicing-pl/` (see that folder's own docstring for why).
 * France gates its own phases by INSEE company-SIZE CATEGORY (GE/ETI/PME/TPE), not a
 * numeric turnover threshold the way Germany does -- a genuinely different shape, not a
 * simplification of the same fact, which is exactly why this story keeps each country's
 * own eligibility logic in its own independent file rather than forcing one shared
 * "turnover-gated mandate" abstraction across countries that don't actually share a gating
 * mechanism.
 */

export type FrCompanySize = "GE" | "ETI" | "PME" | "TPE";

export type FrEinvoicingMandatePhase = {
  key: "reception_all" | "issuance_large_mid" | "issuance_small";
  effectiveFrom: string;
  scope: string;
  description: string;
};

export type FrEinvoicingMandateSchedule = {
  format: string;
  phases: FrEinvoicingMandatePhase[];
  enforcementNote?: string;
};

/** `companySize` is a caller-DECLARED fact (backlog rule 12) -- this platform has no
 * INSEE company-size classification of its own businesses to derive it from. */
export type FrEinvoicingBusinessProfile = {
  companySize: FrCompanySize | null;
};

export type FrEinvoicingSubmitRequest = {
  invoiceId: string;
  siret: string;
  cctPayload: string;
};

export type FrEinvoicingSubmitResponse = {
  transmissionId: string | null;
  status: string;
  raw: Record<string, unknown>;
};

/** France transmits via a Plateforme de Dématérialisation Partenaire (PDP) or the public
 * Portail Public de Facturation (PPF) -- a real, government-recognized clearance/reporting
 * step, unlike Germany's own decentralized exchange, which is exactly why this interface
 * (submit only, no separate status/cancel yet -- no consumer needs them until a real PDP
 * integration exists) is its own shape, not shared with `DeEinvoicingAdapter`. */
export interface FrEinvoicingAdapter {
  submit(request: FrEinvoicingSubmitRequest): Promise<FrEinvoicingSubmitResponse>;
}
