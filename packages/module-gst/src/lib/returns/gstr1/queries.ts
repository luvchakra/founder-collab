import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { resolveStateCode } from "@cofounderai/core/lib/gst";
import { determinePlaceOfSupply } from "../../place-of-supply/determine";
import { mapPartyAddress, selectPartyAddress } from "../../party-tax-context/queries";
import type { PartyAddress } from "../../party-tax-context/types";
import { getPrimaryTaxRegistration } from "../../tax-registrations/queries";
import { getEffectiveGstr1B2cLargeThreshold } from "./threshold";
import { aggregateGstr1 } from "./aggregate";
import type { Gstr1DocType, Gstr1Return, Gstr1SourceDocument } from "./types";

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): "prepare" here means COMPUTE, on demand, from the
 * business's own existing `core.documents`/`core.document_lines` -- there is no new
 * persisted table (checked against the entity-ownership map and this backlog's own §5
 * first: `ReturnDefinition`/`ReturnPeriod`/`ReturnSubmission` are listed as Compliance's
 * own future concepts, but nothing about "preparing" a return implies persisting one yet).
 * This mirrors the exact "lib first" shape every prior epic in this backlog has followed
 * (e.g. COMPLY-P0-05.1's own `getEinvoiceEligibility` computes live from existing data with
 * no table of its own; COMPLY-P0-05.4's `gst.einvoices` only appears once there's an actual
 * SUBMISSION result to persist). A `ReturnPeriod`/`ReturnSubmission` table becomes the right
 * thing to add once COMPLY-P0-07.5 (Return Review Workflow) needs somewhere to persist a
 * period's own Draft/Validate/Review/Approve/File STATE -- this story has no such state to
 * persist; it only assembles the numbers a reviewer would see in "Draft."
 *
 * Reuses this epic's own prior reads rather than re-deriving anything:
 * - `getPrimaryTaxRegistration` (COMPLY-P0-02.1) for the filing business's own state.
 * - `determinePlaceOfSupply` (COMPLY-P0-04.4) for intra/inter-state/export/unknown
 *   classification -- but resolved here via a BATCHED query across every party in the
 *   period (mirroring `lib/filing/queries.ts`'s own `getSalesRegister`/
 *   `getPurchaseRegister` batching), not `resolveSupplyStateCodes`'s own one-party-at-a-time
 *   shape, since a real return period can involve many distinct customers and this module's
 *   own established convention for a period-wide read is one `.in()` query, not N.
 * - `getEffectiveGstr1B2cLargeThreshold` (this story's own new rule lineage) for the B2C
 *   Large invoice-value threshold.
 *
 * **Documented simplification**: the threshold is resolved ONCE, as of the period's own
 * END date, and applied to every document in the period -- not re-resolved per document's
 * own `doc_date`. A return period is realistically a calendar month, and this rule's own
 * one real version change to date (01-Aug-2024) falls exactly on a month boundary, so this
 * never actually produces a wrong answer for a real monthly period; a period whose date
 * range genuinely straddled a rule version change would need per-document resolution this
 * function does not do. Flagged here rather than silently assumed correct in general.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const GSTR1_DOC_TYPES: Gstr1DocType[] = ["invoice", "credit_note", "debit_note"];

const NOT_MODELED_TABLES = [
  "Table 4B/4C (reverse charge / e-commerce-operator-collected B2B supplies) -- no such flag exists on core.documents",
  "Table 6A/6B/6C (exports with/without payment, SEZ, deemed exports) -- exports are detected and excluded, not placed in a Table 6 row; SEZ has no flag on any party",
  "Table 8 (Nil-rated / exempted / non-GST outward supplies) -- no per-line tax treatment is recorded on core.document_lines today",
  "Table 9A / 10 (amendments to a prior period's own B2B/B2CL/exports/B2C Others)  -- no document-amendment/revision history exists",
  "Table 11 (advances received/adjusted) -- no advance-receipt concept exists in core",
  "Table 13 (documents issued, incl. cancelled-document counts) -- core.documents.status has no fixed cross-module vocabulary",
  "Table 14/15 (e-commerce operator supplies) -- no e-commerce-operator concept exists in core",
];

/**
 * The full GSTR-1 draft for one business and period -- see this file's own docstring and
 * `types.ts`'s own docstring for exactly which tables are populated and which are
 * deliberately not. `periodStart`/`periodEnd` are inclusive, `YYYY-MM-DD` dates (the same
 * convention `lib/filing/queries.ts`'s own `getPurchaseRegister`/`getSalesRegister`
 * already use).
 */
export async function getGstr1Return(businessId: string, periodStart: string, periodEnd: string): Promise<Gstr1Return> {
  const core = await coreClient();

  const [registration, thresholdResult, docsResult] = await Promise.all([
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
    getEffectiveGstr1B2cLargeThreshold(periodEnd),
    core
      .from("documents")
      .select("id, doc_type, number, doc_date, party_id, source_ref, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount")
      .eq("business_id", businessId)
      .in("doc_type", GSTR1_DOC_TYPES)
      .gte("doc_date", periodStart)
      .lte("doc_date", periodEnd)
      .order("doc_date"),
  ]);
  if (docsResult.error) throw docsResult.error;
  const docs = docsResult.data;

  const sellerStateCode = registration ? resolveStateCode(registration.jurisdiction, registration.registration_number) : null;

  const partyIds = [...new Set(docs.map((d) => d.party_id))];
  const [partiesRes, taxIdsRes, addressesRes, linesRes] = await Promise.all([
    partyIds.length ? core.from("parties").select("id, name").in("id", partyIds) : Promise.resolve({ data: [], error: null }),
    partyIds.length
      ? core.from("tax_identities").select("party_id, gstin").in("party_id", partyIds)
      : Promise.resolve({ data: [], error: null }),
    partyIds.length
      ? core.from("addresses").select("id, party_id, kind, is_primary, formatted, city, state, postal_code, country").in("party_id", partyIds)
      : Promise.resolve({ data: [], error: null }),
    docs.length
      ? core
          .from("document_lines")
          .select("document_id, hsn_code, quantity, unit_price, cgst_amount, sgst_amount, igst_amount")
          .in(
            "document_id",
            docs.map((d) => d.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (partiesRes.error) throw partiesRes.error;
  if (taxIdsRes.error) throw taxIdsRes.error;
  if (addressesRes.error) throw addressesRes.error;
  if (linesRes.error) throw linesRes.error;

  const partyNameById = new Map(partiesRes.data.map((p) => [p.id, p.name as string]));
  const gstinByPartyId = new Map(taxIdsRes.data.map((t) => [t.party_id, t.gstin as string | null]));
  const addressesByPartyId = new Map<string, PartyAddress[]>();
  for (const row of addressesRes.data) {
    const mapped = mapPartyAddress(row);
    const arr = addressesByPartyId.get(row.party_id as string) ?? [];
    arr.push(mapped);
    addressesByPartyId.set(row.party_id as string, arr);
  }
  const linesByDocumentId = new Map<string, typeof linesRes.data>();
  for (const line of linesRes.data) {
    const arr = linesByDocumentId.get(line.document_id as string) ?? [];
    arr.push(line);
    linesByDocumentId.set(line.document_id as string, arr);
  }

  const sourceDocuments: Gstr1SourceDocument[] = docs.map((doc) => {
    const gstin = gstinByPartyId.get(doc.party_id) ?? null;
    const addresses = addressesByPartyId.get(doc.party_id) ?? [];
    const buyerAddress = selectPartyAddress(addresses, "shipping") ?? selectPartyAddress(addresses, "billing");
    const buyerStateName = buyerAddress?.state ?? null;
    const buyerCountry = buyerAddress?.country ?? null;
    const buyerStateCodeResolved = resolveStateCode(buyerStateName, gstin);
    const placeOfSupply = determinePlaceOfSupply({
      sellerStateCode,
      buyerStateCode: buyerStateCodeResolved,
      buyerCountry,
    });

    const sourceRef = doc.source_ref as { sales_invoice_id?: string } | null;

    return {
      documentId: doc.id,
      docType: doc.doc_type as Gstr1DocType,
      number: doc.number,
      docDate: doc.doc_date,
      partyId: doc.party_id,
      partyName: partyNameById.get(doc.party_id) || "Unknown party",
      gstin,
      placeOfSupply: placeOfSupply.treatment,
      buyerStateCode: placeOfSupply.treatment === "intra_state" || placeOfSupply.treatment === "inter_state" ? buyerStateCodeResolved : null,
      taxableValue: Number(doc.subtotal),
      cgstAmount: Number(doc.cgst_amount),
      sgstAmount: Number(doc.sgst_amount),
      igstAmount: Number(doc.igst_amount),
      invoiceValue: Number(doc.total_amount),
      againstInvoiceId: sourceRef?.sales_invoice_id ?? null,
      lines: (linesByDocumentId.get(doc.id) ?? []).map((line) => ({
        hsnCode: line.hsn_code as string | null,
        quantity: Number(line.quantity),
        taxableValue: Number(line.quantity) * Number(line.unit_price),
        cgstAmount: Number(line.cgst_amount),
        sgstAmount: Number(line.sgst_amount),
        igstAmount: Number(line.igst_amount),
      })),
    };
  });

  const aggregation = aggregateGstr1(sourceDocuments, thresholdResult?.thresholdInr ?? null);

  return {
    businessId,
    periodStart,
    periodEnd,
    b2cLargeThreshold: thresholdResult ? { thresholdInr: thresholdResult.thresholdInr, source: thresholdResult.rule.source } : null,
    b2b: aggregation.b2b,
    b2cLarge: aggregation.b2cLarge,
    b2cOthers: aggregation.b2cOthers,
    creditDebitNotes: aggregation.creditDebitNotes,
    hsnSummary: aggregation.hsnSummary,
    totals: aggregation.totals,
    excluded: aggregation.excluded,
    notModeled: NOT_MODELED_TABLES,
  };
}
