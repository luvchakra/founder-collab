import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { resolveStateCode } from "@cofounderai/core/lib/gst";
import { determinePlaceOfSupply } from "../../place-of-supply/determine";
import { mapPartyAddress, selectPartyAddress } from "../../party-tax-context/queries";
import type { PartyAddress } from "../../party-tax-context/types";
import { getPrimaryTaxRegistration } from "../../tax-registrations/queries";
import type { OutwardDocType, OutwardSupplyDocument } from "./types";

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation) / COMPLY-P0-07.2 (GSTR-3B Preparation): the shared
 * "read every outward-supply document for a period, with place-of-supply/GSTIN/
 * registration-type already resolved" step both return preparers need -- extracted here
 * (rather than duplicated per return type) once GSTR-3B needed the exact same
 * `core.documents`/`core.document_lines` read GSTR-1 already built, plus one more field
 * (`gstRegistrationType`) GSTR-1 itself has no use for. Reuses this epic's own prior reads:
 * `getPrimaryTaxRegistration` (COMPLY-P0-02.1) for the filing business's own state,
 * `determinePlaceOfSupply` (COMPLY-P0-04.4) for intra/inter-state/export/unknown
 * classification. No new table, no duplicate transaction master (backlog rule 3) --
 * reads `core.documents`/`core.document_lines`/`core.parties`/`core.tax_identities`/
 * `core.addresses` directly, exactly as `lib/filing/queries.ts`'s own pre-existing
 * `getSalesRegister` already does, batched the same way (one `.in()` query per related
 * table, not N per-party calls).
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const OUTWARD_DOC_TYPES: OutwardDocType[] = ["invoice", "credit_note", "debit_note"];

/** Every invoice/credit-note/debit-note for a business within `[periodStart, periodEnd]`
 * (inclusive `YYYY-MM-DD` dates), normalized with place-of-supply/GSTIN/registration-type
 * already resolved. */
export async function resolveOutwardDocuments(
  businessId: string,
  periodStart: string,
  periodEnd: string,
): Promise<OutwardSupplyDocument[]> {
  const core = await coreClient();

  const [registration, docsResult] = await Promise.all([
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
    core
      .from("documents")
      .select("id, doc_type, number, doc_date, party_id, source_ref, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount")
      .eq("business_id", businessId)
      .in("doc_type", OUTWARD_DOC_TYPES)
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
      ? core.from("tax_identities").select("party_id, gstin, gst_registration_type").in("party_id", partyIds)
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
  const registrationTypeByPartyId = new Map(
    taxIdsRes.data.map((t) => [t.party_id, t.gst_registration_type as OutwardSupplyDocument["gstRegistrationType"]]),
  );
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

  return docs.map((doc) => {
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
      docType: doc.doc_type as OutwardDocType,
      number: doc.number,
      docDate: doc.doc_date,
      partyId: doc.party_id,
      partyName: partyNameById.get(doc.party_id) || "Unknown party",
      gstin,
      gstRegistrationType: registrationTypeByPartyId.get(doc.party_id) ?? null,
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
}
