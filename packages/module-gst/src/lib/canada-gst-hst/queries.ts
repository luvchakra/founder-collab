import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { resolveCaProvinceCode } from "../compliance/ca-provinces";
import { mapPartyAddress, selectPartyAddress } from "../party-tax-context/queries";
import type { PartyAddress } from "../party-tax-context/types";
import { determineCaPlaceOfSupply } from "./place-of-supply";
import { getEffectiveGstHstRate } from "./rules";

/**
 * COMPLY-P1-03.4/03.5 (Filing Periods / CRA Filing Adapter): the one new "prepare"
 * function this reuse needs, feeding `lib/returns/lifecycle/mutations.ts`'s own
 * `computeReturnSnapshot` dispatcher exactly like `getUsSalesTaxReturn` does for
 * `us_sales_tax` -- `gst.return_periods`' own Draft->Validate->Review->Approve->File
 * lifecycle, snapshot guarantee, and database-level lock (COMPLY-P0-07.5/07.6/07.7) all
 * work unchanged for a `ca_gst_hst` return type with NO jurisdiction column needed:
 * unlike a US sales tax return (filed separately PER STATE), Canada's own GST/HST return
 * is ONE federal filing per period regardless of how many provinces a business sold into
 * -- CRA reallocates the harmonized provincial share internally, not the filer's own job
 * -- so `jurisdiction` stays `null` for this return type, the same "national return"
 * convention GSTR-1/3B/9 already established.
 *
 * **Scoped to the FEDERAL return only, a real named limitation**: this reports total
 * taxable/zero-rated/unresolved sales and the FEDERAL GST/HST collected. It does NOT
 * include the separate provincial PST/QST/RST layer (COMPLY-P1-03.2) at all -- that tax is
 * administered by each province's OWN revenue agency via its own SEPARATE return/portal,
 * not part of the CRA's own federal GST/HST filing this function prepares. A real,
 * plausible future need (a BC PST return, a Quebec QST return, ...), named here rather
 * than built -- each would need its own provincial filing-adapter story, not a bullet
 * point squeezed into this one.
 *
 * **"CRA Filing Adapter" (COMPLY-P1-03.5), scoped honestly**: there is no live CRA NETFILE/
 * GST/HST Internet File Transfer API this platform drives end-to-end (the same "no live
 * government filing API" posture COMPLY-P0-05.3/06.3's own real IRP/GSP HTTP adapters are
 * the sole exception to in this whole backlog) -- CRA's own certified-software program is a
 * real, formal certification process this sandboxed session has no path to. This story's
 * own "adapter" is exactly `lib/returns/lifecycle/mutations.ts`'s own already-existing
 * `markReturnPeriodFiled`/`recordReturnPeriodPayment` -- recording that a human already
 * filed (via NETFILE, certified software, or a CRA-issued confirmation number) and
 * remitted, never claiming or automating the filing itself, the same posture every other
 * return type in this backlog already follows. No new code was needed for this half of the
 * story -- the existing lifecycle functions are already this general.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const SALE_DOC_TYPES = ["invoice", "credit_note", "debit_note"] as const;
type SaleDocType = (typeof SALE_DOC_TYPES)[number];

function signForDocType(docType: SaleDocType): 1 | -1 {
  return docType === "credit_note" ? -1 : 1;
}

export type CaGstHstReturnLine = {
  documentId: string;
  docType: SaleDocType;
  partyId: string;
  province: string | null;
  treatment: "domestic" | "export" | "unknown";
  taxableAmount: number;
  gstHstCollected: number | null;
  ruleRefs: string[];
};

export type CaGstHstReturn = {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  taxableSales: number;
  zeroRatedSales: number;
  unresolvedSales: number;
  gstHstCollected: number;
  lines: CaGstHstReturnLine[];
  notModeled: string[];
};

async function resolveCaSaleLines(businessId: string, periodStart: string, periodEnd: string): Promise<CaGstHstReturnLine[]> {
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

  const rateByProvince = new Map<string, Awaited<ReturnType<typeof getEffectiveGstHstRate>>>();
  async function rateFor(province: string) {
    if (!rateByProvince.has(province)) rateByProvince.set(province, await getEffectiveGstHstRate(province, periodEnd));
    return rateByProvince.get(province) ?? null;
  }

  const lines: CaGstHstReturnLine[] = [];
  for (const doc of docs) {
    const sign = signForDocType(doc.doc_type);
    const taxableAmount = sign * Number(doc.subtotal);

    const addresses = addressesByPartyId.get(doc.party_id) ?? [];
    const buyerAddress = selectPartyAddress(addresses, "shipping") ?? selectPartyAddress(addresses, "billing");
    const buyerProvince = resolveCaProvinceCode(buyerAddress?.state ?? null);
    const placeOfSupply = determineCaPlaceOfSupply(buyerProvince, buyerAddress?.country ?? null);

    if (placeOfSupply.treatment !== "domestic" || !placeOfSupply.province) {
      lines.push({
        documentId: doc.id,
        docType: doc.doc_type,
        partyId: doc.party_id,
        province: null,
        treatment: placeOfSupply.treatment,
        taxableAmount,
        gstHstCollected: placeOfSupply.treatment === "export" ? 0 : null,
        ruleRefs: [],
      });
      continue;
    }

    const rate = await rateFor(placeOfSupply.province);
    if (!rate) {
      lines.push({
        documentId: doc.id,
        docType: doc.doc_type,
        partyId: doc.party_id,
        province: placeOfSupply.province,
        treatment: "unknown",
        taxableAmount,
        gstHstCollected: null,
        ruleRefs: [],
      });
      continue;
    }

    lines.push({
      documentId: doc.id,
      docType: doc.doc_type,
      partyId: doc.party_id,
      province: placeOfSupply.province,
      treatment: "domestic",
      taxableAmount,
      gstHstCollected: taxableAmount * (rate.ratePercent / 100),
      ruleRefs: [rate.rule.id],
    });
  }

  return lines;
}

export async function getCaGstHstReturn(businessId: string, periodStart: string, periodEnd: string): Promise<CaGstHstReturn> {
  const lines = await resolveCaSaleLines(businessId, periodStart, periodEnd);

  let grossSales = 0;
  let taxableSales = 0;
  let zeroRatedSales = 0;
  let unresolvedSales = 0;
  let gstHstCollected = 0;

  for (const line of lines) {
    grossSales += line.taxableAmount;
    if (line.treatment === "export") zeroRatedSales += line.taxableAmount;
    else if (line.treatment === "unknown") unresolvedSales += line.taxableAmount;
    else {
      taxableSales += line.taxableAmount;
      gstHstCollected += line.gstHstCollected ?? 0;
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
    gstHstCollected,
    lines,
    notModeled: [
      "Provincial PST/QST/RST (COMPLY-P1-03.2) -- administered separately by each province, not part of this federal GST/HST return.",
      "Input Tax Credits (ITCs) on the filer's own purchases -- this return models outward GST/HST collected only, not the net-tax ITC offset.",
      "Zero-rating for domestic basic groceries/exempt supplies -- only cross-border exports are treated as zero-rated here; a full domestic zero-rated/exempt supply classification is not modeled.",
      "The real CRA place-of-supply cascade for services/intangible personal property beyond a single resolved buyer province (see place-of-supply.ts's own docstring).",
    ],
  };
}
