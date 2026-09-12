import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { mapPartyAddress, selectPartyAddress } from "../party-tax-context/queries";
import type { PartyAddress } from "../party-tax-context/types";
import { classifySgSupply } from "./supply-classification";
import { getEffectiveSgGstStandardRate } from "./rules";

/**
 * COMPLY-P1-04.2 (GST F5): the one new "prepare" function this reuse needs, feeding
 * `lib/returns/lifecycle/mutations.ts`'s own `computeReturnSnapshot` dispatcher exactly
 * like `getCaGstHstReturn`/`getUsSalesTaxReturn` do -- `gst.return_periods`' own
 * Draft->Validate->Review->Approve->File lifecycle, snapshot guarantee, and
 * database-level lock all work unchanged for an `sg_gst_f5` return type with NO
 * jurisdiction column needed: Singapore has exactly one nationwide GST return (myTax
 * Portal's own GST F5 form), so `jurisdiction` stays `null`, the same "national return"
 * convention GSTR-1/3B/9 and `ca_gst_hst` already established.
 *
 * **Scoped to output tax on sales only, a real named limitation** -- this reports gross/
 * taxable (standard-rated)/zero-rated (export)/unresolved sales and the GST collected on
 * them. The real GST F5 form has additional boxes this does NOT prepare: input tax and
 * refunds claimed on the business's own purchases (Box 7), a separate exempt-supplies
 * total (Box 3, e.g. financial services or residential property -- this function only
 * distinguishes standard-rated domestic sales from zero-rated exports, not a full
 * exempt/out-of-scope/reverse-charge classification), and net GST payable/refundable
 * (Box 8, output tax minus input tax) -- named here rather than built, the same scope
 * boundary `getCaGstHstReturn`'s own docstring already draws for Canada's ITC/net-tax
 * calculation.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const SALE_DOC_TYPES = ["invoice", "credit_note", "debit_note"] as const;
type SaleDocType = (typeof SALE_DOC_TYPES)[number];

function signForDocType(docType: SaleDocType): 1 | -1 {
  return docType === "credit_note" ? -1 : 1;
}

export type SgGstF5ReturnLine = {
  documentId: string;
  docType: SaleDocType;
  partyId: string;
  treatment: "domestic" | "export" | "unknown";
  taxableAmount: number;
  gstCollected: number | null;
  ruleRefs: string[];
};

export type SgGstF5Return = {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  taxableSales: number;
  zeroRatedSales: number;
  unresolvedSales: number;
  gstCollected: number;
  lines: SgGstF5ReturnLine[];
  notModeled: string[];
};

async function resolveSgSaleLines(businessId: string, periodStart: string, periodEnd: string): Promise<SgGstF5ReturnLine[]> {
  const core = await coreClient();

  const docsResult = await core
    .from("documents")
    .select("id, doc_type, party_id, subtotal")
    .eq("business_id", businessId)
    .in("doc_type", SALE_DOC_TYPES)
    .gte("doc_date", periodStart)
    .lte("doc_date", periodEnd);
  if (docsResult.error) throw docsResult.error;
  const docs = docsResult.data as { id: string; doc_type: SaleDocType; party_id: string; subtotal: string | number }[];
  if (docs.length === 0) return [];

  const partyIds = [...new Set(docs.map((d) => d.party_id))];
  const addressesRes = await core.from("addresses").select("id, party_id, kind, is_primary, formatted, city, state, postal_code, country").in("party_id", partyIds);
  if (addressesRes.error) throw addressesRes.error;

  const addressesByPartyId = new Map<string, PartyAddress[]>();
  for (const row of addressesRes.data) {
    const mapped = mapPartyAddress(row);
    const arr = addressesByPartyId.get(row.party_id as string) ?? [];
    arr.push(mapped);
    addressesByPartyId.set(row.party_id as string, arr);
  }

  const rate = await getEffectiveSgGstStandardRate(periodEnd);

  const lines: SgGstF5ReturnLine[] = [];
  for (const doc of docs) {
    const sign = signForDocType(doc.doc_type);
    const taxableAmount = sign * Number(doc.subtotal);

    const addresses = addressesByPartyId.get(doc.party_id) ?? [];
    const buyerAddress = selectPartyAddress(addresses, "shipping") ?? selectPartyAddress(addresses, "billing");
    const classification = classifySgSupply(buyerAddress?.country ?? null);

    if (classification.treatment !== "domestic") {
      lines.push({
        documentId: doc.id,
        docType: doc.doc_type,
        partyId: doc.party_id,
        treatment: classification.treatment,
        taxableAmount,
        gstCollected: classification.treatment === "export" ? 0 : null,
        ruleRefs: [],
      });
      continue;
    }

    if (!rate) {
      lines.push({
        documentId: doc.id,
        docType: doc.doc_type,
        partyId: doc.party_id,
        treatment: "unknown",
        taxableAmount,
        gstCollected: null,
        ruleRefs: [],
      });
      continue;
    }

    lines.push({
      documentId: doc.id,
      docType: doc.doc_type,
      partyId: doc.party_id,
      treatment: "domestic",
      taxableAmount,
      gstCollected: taxableAmount * (rate.ratePercent / 100),
      ruleRefs: [rate.rule.id],
    });
  }

  return lines;
}

export async function getSgGstF5Return(businessId: string, periodStart: string, periodEnd: string): Promise<SgGstF5Return> {
  const lines = await resolveSgSaleLines(businessId, periodStart, periodEnd);

  let grossSales = 0;
  let taxableSales = 0;
  let zeroRatedSales = 0;
  let unresolvedSales = 0;
  let gstCollected = 0;

  for (const line of lines) {
    grossSales += line.taxableAmount;
    if (line.treatment === "export") zeroRatedSales += line.taxableAmount;
    else if (line.treatment === "unknown") unresolvedSales += line.taxableAmount;
    else {
      taxableSales += line.taxableAmount;
      gstCollected += line.gstCollected ?? 0;
    }
  }

  return {
    businessId,
    periodStart,
    periodEnd,
    grossSales,
    taxableSales,
    zeroRatedSales,
    unresolvedSales,
    gstCollected,
    lines,
    notModeled: [
      "Input tax and refunds claimed on the business's own purchases (GST F5 Box 7) -- this return models output tax on sales only.",
      "A separate exempt-supplies total (GST F5 Box 3, e.g. financial services or the sale/lease of residential property) -- only cross-border exports are treated as zero-rated here; a full domestic exempt/out-of-scope classification is not modeled.",
      "Reverse charge on imported services/low-value goods (Singapore's Overseas Vendor Registration / reverse-charge regime) -- not modeled.",
      "Net GST payable/refundable (GST F5 Box 8, output tax minus input tax) -- this return reports output tax collected only.",
    ],
  };
}
