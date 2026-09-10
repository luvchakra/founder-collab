/**
 * Same result shape as every other module's `contract/index.ts` (ADR-10) -- a caller
 * not licensed for `discovery` gets `{ ok: false, error: "MODULE_NOT_LICENSED" }` back
 * as a normal value to branch on, not an exception.
 */
export type ContractResult<T> = { ok: true; data: T } | { ok: false; error: "MODULE_NOT_LICENSED" | "NOT_FOUND" | string };

/** The CRM->Discovery handoff (docs/design/crm-module-design.md Part A, A4): "Convert
 * to prospect" on a ticket whose sender shows buying intent. `contactChannel`/
 * `contactHandle` describe where the lead actually came from (a WhatsApp number, an
 * Instagram handle, etc.) so the created prospect's own context carries that forward
 * rather than looking identical to one Discovery found on its own. */
/** One party's prospect/deal status, if it has one (docs/design/crm-module-design.md
 * Part B, B1's Customer 360 panel: "prospect/deal stage, if this party is or was a
 * prospect"). */
export type ContractProspectSummary = {
  prospectId: string;
  productName: string;
  status: "new" | "qualified" | "disqualified";
  outcome: "open" | "won" | "lost";
};

export type CreateProspectFromExternalLeadInput = {
  companyName: string;
  contactName?: string;
  contactChannel: "whatsapp" | "instagram" | "facebook_messenger" | "google_business_messages";
  contactHandle: string;
  firstMessage: string;
  sourceTicketId: string;
  /** If the caller already resolved a core.parties row for this sender (e.g. CRM's
   * inbound-webhook ingestion already created a lead-only party for the ticket), pass
   * its id so the new prospect links to that same party instead of getting a second,
   * disconnected one -- see contract/index.ts's own comment on why this can't just
   * reuse createProspect()'s normal auto-create path. */
  existingPartyId?: string | null;
};

/** The Inventory->Discovery mirror (item #1 of a cross-module UX pass): a product
 * created natively in Inventory (a `core.items` row) should also exist as a Discovery
 * product to prospect against. */
export type CreateProductFromInventoryItemInput = {
  itemId: string;
  name: string;
  description?: string | null;
};
