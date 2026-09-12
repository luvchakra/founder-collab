/**
 * COMPLY-P1-04.3/04.5/04.6 (InvoiceNow Eligibility / InvoiceNow Adapter / Transmission
 * Status): Singapore's own GST InvoiceNow (Peppol) types -- deliberately not shared with
 * `lib/einvoicing-de/`/`-fr/`/`-be/`/`-pl/` even where a shape looks similar (the mandate
 * SCHEDULE shape below is intentionally parallel to Germany's own
 * `DeEinvoicingMandateSchedule`), matching this module's own "country adapters must be
 * independent" precedent (COMPLY-P1-01.6's own docstring) -- each country pack owns its
 * own types.
 */

export type SgInvoiceNowMandatePhaseKey =
  | "soft_launch"
  | "new_voluntary_registrants_recent_incorporation"
  | "all_new_voluntary_registrants"
  | "all_gst_registered_businesses";

export type SgInvoiceNowMandatePhase = {
  key: SgInvoiceNowMandatePhaseKey;
  effectiveFrom: string;
  scope: string;
  description: string;
};

export type SgInvoiceNowMandateSchedule = {
  format: string;
  phases: SgInvoiceNowMandatePhase[];
};

/** What a caller must declare about the business to know which phases actually apply --
 * caller-DECLARED facts (backlog rule 12, the same "self-declared, not computed" posture
 * `DeEinvoicingBusinessProfile`/COMPLY-P0-04.2's own `eInvoiceEligible` flag already take),
 * never inferred or looked up by this module. */
export type SgInvoiceNowBusinessProfile = {
  /** Whether this business's GST registration is compulsory or voluntary -- IRAS's own
   * phased rollout treats these very differently (see `mandate.ts`'s own docstring). */
  registrationBasis: "compulsory" | "voluntary" | null;
  /** ISO date the business was incorporated, or `null` if unknown/not applicable (e.g. a
   * sole proprietorship with no incorporation date) -- needed only to test the
   * `new_voluntary_registrants_recent_incorporation` phase's own "incorporated within 6
   * months of the GST registration application" condition. */
  incorporationDate: string | null;
  /** ISO date of this business's own GST registration application -- the other half of
   * the same 6-month test. */
  gstRegistrationDate: string | null;
};

export type SgInvoiceNowPhaseApplicability = {
  phase: SgInvoiceNowMandatePhase;
  /** `null` only for `all_gst_registered_businesses` once its own window has opened --
   * IRAS notifies each affected business individually of its own exact onboarding date
   * within the 2028-2031 window, a fact this platform has no source for per business, so
   * this is surfaced as genuinely UNKNOWN rather than guessed `false` (backlog rule 11,
   * "never guess in the risky direction" -- understating an obligation is the risky
   * direction here, not overstating it). */
  applies: boolean | null;
};

/**
 * COMPLY-P1-04.5 (InvoiceNow Adapter): "submit/status/cancel/fetch-shaped, or whatever
 * Peppol's own real transmission model actually calls for" -- verified via WebSearch
 * 2026-09-12 (edicomgroup.com, peppolvalidator.com, ecosio.com, sovos.com, sesami.com --
 * all independently agreeing) that Peppol's real transmission model is NOT a government
 * clearance/approval call the way India's own IRP is: it is a four-corner (Singapore:
 * five-corner, extending the standard model with a parallel leg to IRAS) ASYNCHRONOUS
 * message-delivery network -- a supplier's own Access Point relays a signed AS4 message
 * to the buyer's own Access Point (corners 2 and 3), addressed by the recipient's own
 * Peppol Participant ID (see `lib/tax-registrations/sg-registration-profile.ts`'s own
 * `PeppolId` for this business's own ID), with delivery confirmed or rejected
 * asynchronously (a Message Level Response) -- there is no clearance step to accept/
 * reject BEFORE delivery the way IRP's own `submit` grants or refuses an IRN. Singapore's
 * OWN extension (the InvoiceNow Requirement, COMPLY-P1-04.3) layers a SEPARATE, parallel
 * data-transmission leg to IRAS itself (via API) on top of this same network send, for
 * businesses the mandate schedule actually covers -- `transmitToIras` on the request
 * below models that as an explicit flag, not a second adapter call.
 *
 * This deliberately has NO `cancel` and NO `fetch`, unlike `IrpAdapter` -- named
 * explicitly why: Peppol has no network-level "cancel a delivered message" operation at
 * all (a wrongly-sent invoice is corrected with a credit note, the same real-world
 * mechanism `core.documents`' own void-via-credit-note convention already uses elsewhere
 * in this platform, not an API call this adapter could expose); and IRAS's own 5-corner
 * leg is a PUSH of data TO IRAS, not a document store the sender can query back the way
 * India's IRP persists an invoice for retrieval -- there is nothing this adapter could
 * "fetch."
 */
export type InvoiceNowSubmitRequest = {
  invoiceId: string;
  buyerPeppolId: string;
  /** The BIS Billing 3.0 UBL XML payload -- opaque to this adapter, same "the caller
   * already built the document, this adapter only transmits it" posture
   * `DeEinvoicingSubmitRequest.xmlPayload` already takes. */
  documentXml: string;
  /** Whether this specific submission is also subject to the GST InvoiceNow
   * Requirement's own IRAS data-transmission leg (COMPLY-P1-04.3's own mandate
   * determination decides this per business/phase, passed through here rather than
   * re-decided inside the adapter). */
  transmitToIras: boolean;
};

export type InvoiceNowSubmitResponse = {
  /** The Peppol AS4 message id -- `null` only if the underlying transport genuinely
   * returned none (should not happen for a real send, defensive rather than assumed). */
  peppolMessageId: string | null;
  transmissionStatus: "sent" | "delivered" | "rejected";
  /** `null` unless `transmitToIras` was `true` AND IRAS accepted the Mandatory Data
   * Elements submission -- absence here does not by itself mean IRAS rejected it; a
   * `transmitToIras: false` request never populates this field at all. */
  irasSubmissionId: string | null;
  raw: Record<string, unknown>;
};

export type InvoiceNowStatusRequest = {
  peppolMessageId: string;
};

/** Loose passthrough (`[key: string]: unknown` alongside the two named fields) -- same
 * "no existing persisted shape to normalize a status response into yet" posture
 * `IrpStatusResponse` already takes. */
export type InvoiceNowStatusResponse = {
  peppolMessageId: string;
  status: string;
  [key: string]: unknown;
};

/** The provider-agnostic contract every InvoiceNow/Peppol Access Point integration in
 * this module goes through -- see this file's own docstring above for why `submit`/
 * `status` are the whole interface. */
export interface InvoiceNowAdapter {
  submit(request: InvoiceNowSubmitRequest): Promise<InvoiceNowSubmitResponse>;
  status(request: InvoiceNowStatusRequest): Promise<InvoiceNowStatusResponse>;
}

/** COMPLY-P1-04.6 (Transmission Status): one `gst.invoicenow_transmissions` row -- the
 * persisted counterpart to `InvoiceNowSubmitResponse`, one row per document ever (same
 * "append-only, one row per document" shape `gst.einvoices`/`gst.eway_bills` already
 * established). Kept in the SAME snake_case-matches-the-DB-row shape `Einvoice`
 * (`lib/einvoicing/types.ts`) already established for this class of table, rather than a
 * camelCase mapping layer this module has no other consumer for yet. */
export type InvoiceNowTransmissionStatus = "sent" | "delivered" | "rejected" | "failed";

export type InvoiceNowTransmission = {
  id: string;
  business_id: string;
  document_id: string;
  status: InvoiceNowTransmissionStatus;
  peppol_message_id: string | null;
  buyer_peppol_id: string | null;
  iras_submission_id: string | null;
  rejected_reason: string | null;
  raw_response: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
