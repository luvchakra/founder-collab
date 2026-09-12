import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { resolveUsStateCode } from "../../compliance/us-states";
import { getValidExemptionCertificateForParty } from "../../exemption-certificates/queries";
import { mapPartyAddress, selectPartyAddress } from "../../party-tax-context/queries";
import type { PartyAddress } from "../../party-tax-context/types";
import { getUsProductTaxability } from "../../us-product-taxability/queries";
import type { UsProductTaxabilityDetermination } from "../../us-product-taxability/types";
import { aggregateUsSalesTaxReturn } from "./aggregate";
import type { ResolvedUsSaleLine, UsSalesTaxReturn } from "./types";

/**
 * COMPLY-P1-02.7 (United States -- Sales Tax Returns/Remittance): "reuse the generic
 * return-preparation/drill-down/lifecycle machinery Epic 07 already built for India ...
 * rather than rebuilding it for the US" (this run's own instruction). This file is the ONE
 * new "prepare" step this reuse actually needs -- `lib/returns/lifecycle/` (COMPLY-P0-07.5/
 * 07.6/07.7, extended by this story's own migration to add a `jurisdiction` column and the
 * `us_sales_tax` return type) is otherwise unchanged; the Draft->Validate->Review->Approve->
 * File pipeline, its snapshot-required-once-validated guarantee, and its database-level
 * lock all already work for this new return type with zero further code changes.
 *
 * **Not the same read as `resolveOutwardDocuments`** (`lib/returns/shared/queries.ts`),
 * checked first and confirmed the wrong fit rather than reused blindly: that function
 * resolves an India-specific shape (a GSTIN, `gst_registration_type`, a GST-style place-
 * of-supply, CGST/SGST/IGST columns) via India-specific state-code resolution
 * (`resolveStateCode`, which parses a GSTIN). A US sale has none of that -- its own state
 * code comes straight from the buyer's own address `state` FIELD (`resolveUsStateCode`,
 * COMPLY-P1-02.7's own new helper on `lib/compliance/us-states.ts`, tolerating either a
 * full name or the two-letter code any casing), and this function needs each line's own
 * `item_id` (to run COMPLY-P1-02.5's own product-taxability determination), which the
 * India-shaped reader has no reason to carry. Reused instead of duplicated: `core.
 * documents`/`core.document_lines` themselves (read directly, same "no duplicate
 * transaction master" discipline every prior return preparer follows), and
 * `mapPartyAddress`/`selectPartyAddress` (COMPLY-P0-03.4's own address-selection helper,
 * genuinely regime-agnostic despite living in this module already).
 *
 * **Sourcing rule -- destination-based, a documented simplification**: this function
 * counts a sale toward `stateCode` when the BUYER's own resolved state (shipping address
 * preferred, falling back to billing) matches. Real US sales tax sourcing rules are more
 * nuanced (a handful of ORIGIN-based states tax based on the SELLER's own location for an
 * intrastate sale) -- not modeled here; destination-based is both the majority rule and the
 * only one that matters for a REMOTE seller registered under economic nexus (COMPLY-
 * P1-02.2), which is this backlog's own primary scenario per its own §2 US research.
 *
 * **Certificate overrides product taxability, never the reverse**: a valid exemption
 * certificate on file for the buyer covering this state (COMPLY-P1-02.6) makes the WHOLE
 * line exempt regardless of what COMPLY-P1-02.5's own product-taxability engine would
 * otherwise say -- that is literally what a resale/exemption certificate means. Product
 * taxability is only consulted when no certificate covers the sale.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const SALE_DOC_TYPES = ["invoice", "credit_note", "debit_note"] as const;
type SaleDocType = (typeof SALE_DOC_TYPES)[number];

function signForDocType(docType: SaleDocType): 1 | -1 {
  return docType === "credit_note" ? -1 : 1;
}

/**
 * Every invoice/credit-note/debit-note line for a business within `[periodStart,
 * periodEnd]` whose buyer resolves to `stateCode`, each classified via COMPLY-P1-02.6's
 * exemption certificates first, then COMPLY-P1-02.5's product taxability. Caches both the
 * per-item taxability determination and the per-party certificate lookup across lines
 * (many lines commonly share the same item or the same customer within one period) rather
 * than repeating an identical async call per line.
 */
export async function resolveUsSaleLines(businessId: string, stateCode: string, periodStart: string, periodEnd: string): Promise<ResolvedUsSaleLine[]> {
  const core = await coreClient();

  const docsResult = await core
    .from("documents")
    .select("id, doc_type, party_id")
    .eq("business_id", businessId)
    .in("doc_type", SALE_DOC_TYPES)
    .gte("doc_date", periodStart)
    .lte("doc_date", periodEnd);
  if (docsResult.error) throw docsResult.error;
  const docs = docsResult.data as { id: string; doc_type: SaleDocType; party_id: string }[];
  if (docs.length === 0) return [];

  const partyIds = [...new Set(docs.map((d) => d.party_id))];
  const [addressesRes, linesRes] = await Promise.all([
    core.from("addresses").select("id, party_id, kind, is_primary, formatted, city, state, postal_code, country").in("party_id", partyIds),
    core
      .from("document_lines")
      .select("document_id, item_id, quantity, unit_price, taxable")
      .in(
        "document_id",
        docs.map((d) => d.id),
      ),
  ]);
  if (addressesRes.error) throw addressesRes.error;
  if (linesRes.error) throw linesRes.error;

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

  // Only documents whose buyer resolves to this state.
  const docsInState = docs.filter((doc) => {
    const addresses = addressesByPartyId.get(doc.party_id) ?? [];
    const buyerAddress = selectPartyAddress(addresses, "shipping") ?? selectPartyAddress(addresses, "billing");
    return resolveUsStateCode(buyerAddress?.state ?? null) === stateCode;
  });

  const certificateByPartyId = new Map<string, Awaited<ReturnType<typeof getValidExemptionCertificateForParty>>>();
  async function certificateFor(partyId: string) {
    if (!certificateByPartyId.has(partyId)) {
      certificateByPartyId.set(partyId, await getValidExemptionCertificateForParty(businessId, partyId, stateCode, periodEnd));
    }
    return certificateByPartyId.get(partyId) ?? null;
  }

  const taxabilityByItemId = new Map<string, UsProductTaxabilityDetermination | null>();
  async function taxabilityFor(itemId: string) {
    if (!taxabilityByItemId.has(itemId)) {
      taxabilityByItemId.set(itemId, await getUsProductTaxability(businessId, itemId, stateCode, periodEnd));
    }
    return taxabilityByItemId.get(itemId) ?? null;
  }

  const resolved: ResolvedUsSaleLine[] = [];
  for (const doc of docsInState) {
    const sign = signForDocType(doc.doc_type);
    const lines = linesByDocumentId.get(doc.id) ?? [];
    for (const line of lines) {
      const taxableAmount = sign * Number(line.quantity) * Number(line.unit_price);
      const itemId = line.item_id as string;

      if (line.taxable === false) {
        resolved.push({
          documentId: doc.id,
          docType: doc.doc_type,
          partyId: doc.party_id,
          itemId,
          category: null,
          taxableAmount,
          resolved: true,
          treatment: "exempt",
          ratePercent: 0,
          taxAmount: 0,
          exemptionReason: "line_not_taxable",
          exemptionCertificateId: null,
          ruleRefs: [],
        });
        continue;
      }

      const certificate = await certificateFor(doc.party_id);
      if (certificate) {
        resolved.push({
          documentId: doc.id,
          docType: doc.doc_type,
          partyId: doc.party_id,
          itemId,
          category: null,
          taxableAmount,
          resolved: true,
          treatment: "exempt",
          ratePercent: 0,
          taxAmount: 0,
          exemptionReason: "certificate",
          exemptionCertificateId: certificate.id,
          ruleRefs: [],
        });
        continue;
      }

      const determination = await taxabilityFor(itemId);
      if (!determination || !determination.resolved) {
        resolved.push({
          documentId: doc.id,
          docType: doc.doc_type,
          partyId: doc.party_id,
          itemId,
          category: determination?.category ?? null,
          taxableAmount,
          resolved: false,
          treatment: null,
          ratePercent: null,
          taxAmount: null,
          exemptionReason: null,
          exemptionCertificateId: null,
          ruleRefs: determination?.ruleRefs ?? [],
        });
        continue;
      }

      const ratePercent = determination.ratePercent ?? 0;
      const taxAmount = determination.treatment === "exempt" ? 0 : taxableAmount * (ratePercent / 100);
      resolved.push({
        documentId: doc.id,
        docType: doc.doc_type,
        partyId: doc.party_id,
        itemId,
        category: determination.category,
        taxableAmount,
        resolved: true,
        treatment: determination.treatment,
        ratePercent,
        taxAmount,
        exemptionReason: determination.treatment === "exempt" ? "product_taxability" : null,
        exemptionCertificateId: null,
        ruleRefs: determination.ruleRefs,
      });
    }
  }

  return resolved;
}

/**
 * The full return content for one (business, state, period) -- what this platform can
 * itemize/aggregate for a state sales tax return. Not a live filing/remittance action
 * (backlog rule 11: this backlog has no state revenue-department filing API adapter,
 * unlike India's own IRP/GSP e-invoice/e-way-bill adapters) -- this is the PREPARE step
 * `lib/returns/lifecycle/mutations.ts#validateReturnPeriod` freezes into a `gst.
 * return_periods` snapshot, exactly the same "compute = this function, persist = the
 * lifecycle layer" boundary GSTR-1/3B/9 already established.
 */
export async function getUsSalesTaxReturn(businessId: string, stateCode: string, periodStart: string, periodEnd: string): Promise<UsSalesTaxReturn> {
  const lines = await resolveUsSaleLines(businessId, stateCode, periodStart, periodEnd);
  return aggregateUsSalesTaxReturn(businessId, stateCode, periodStart, periodEnd, lines, [
    "Local (county/city/special-district) sales tax add-on rates -- this schema has no local-rate concept at all (the same gap COMPLY-P1-02.1 already flagged).",
    "Origin-based sourcing for the handful of US states that tax intrastate sales by the seller's own location rather than the buyer's -- this function always sources by the buyer's own resolved state (destination-based).",
    "A vendor/dealer discount some states allow for timely filing/remittance.",
    "Use tax owed on the filer's own untaxed purchases (this return models OUTWARD sales tax collected, not use tax self-assessment).",
    "Prior-period amendments/corrections -- no document-amendment/revision history exists to detect a line that actually belongs to an earlier period's own return.",
  ]);
}
