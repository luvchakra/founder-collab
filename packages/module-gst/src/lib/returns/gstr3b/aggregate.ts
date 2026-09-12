import { classifyGstr3bInterStateBucket, classifyGstr3bOutwardDocument } from "./classify";
import type { OutwardDocType, OutwardSupplyDocument } from "../shared/types";
import type { Gstr3bInterStateStateRow, Gstr3bOutwardBucket } from "./types";

/** Same credit-note-subtracts/debit-note-and-invoice-add sign convention
 * COMPLY-P0-07.1's own `aggregate.ts` established, applied here for the same reason: a
 * credit note reduces previously-reported outward supply. */
function signFor(docType: OutwardDocType): 1 | -1 {
  return docType === "credit_note" ? -1 : 1;
}

function emptyBucket(): Gstr3bOutwardBucket {
  return { taxableValue: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, documentIds: [] };
}

function addToBucket(bucket: Gstr3bOutwardBucket, doc: OutwardSupplyDocument, sign: 1 | -1): void {
  bucket.taxableValue += sign * doc.taxableValue;
  bucket.igstAmount += sign * doc.igstAmount;
  bucket.cgstAmount += sign * doc.cgstAmount;
  bucket.sgstAmount += sign * doc.sgstAmount;
  bucket.documentIds.push(doc.documentId);
}

export type Gstr3bOutwardAggregation = {
  outwardTaxableOther: Gstr3bOutwardBucket;
  outwardZeroRated: Gstr3bOutwardBucket;
  interStateToUnregistered: Gstr3bInterStateStateRow[];
  interStateToComposition: Gstr3bInterStateStateRow[];
  excludedUnknownPlaceOfSupply: string[];
};

/**
 * COMPLY-P0-07.2 (GSTR-3B Preparation): the pure aggregation step for Tables 3.1(a)/(b)
 * and 3.2 -- classifies every source document via `classifyGstr3bOutwardDocument`/
 * `classifyGstr3bInterStateBucket` and buckets it accordingly. DB-independent and
 * unit-testable on its own, same split as COMPLY-P0-07.1's own `aggregateGstr1` vs.
 * `queries.ts`.
 *
 * Table 3.2 is a SUBSET view, not an alternative bucket: an inter-state supply to an
 * unregistered person or composition dealer is counted in BOTH `outwardTaxableOther` (it
 * is still a taxable outward supply) AND, again, broken out by state in
 * `interStateToUnregistered`/`interStateToComposition` -- matching the real form, where
 * Table 3.2 is explicitly a state-wise breakdown OF a subset of Table 3.1(a)'s own total,
 * not a deduction from it.
 */
export function aggregateGstr3bOutward(documents: OutwardSupplyDocument[]): Gstr3bOutwardAggregation {
  const outwardTaxableOther = emptyBucket();
  const outwardZeroRated = emptyBucket();
  const excludedUnknownPlaceOfSupply: string[] = [];
  const unregisteredByState = new Map<string, Gstr3bInterStateStateRow>();
  const compositionByState = new Map<string, Gstr3bInterStateStateRow>();

  for (const doc of documents) {
    const classification = classifyGstr3bOutwardDocument(doc.placeOfSupply);
    if (classification === "excluded_unknown_place_of_supply") {
      excludedUnknownPlaceOfSupply.push(doc.documentId);
      continue;
    }

    const sign = signFor(doc.docType);
    addToBucket(classification === "zero_rated" ? outwardZeroRated : outwardTaxableOther, doc, sign);

    if (classification === "zero_rated") continue; // Table 3.2 is domestic inter-state only.

    const bucket = classifyGstr3bInterStateBucket({
      placeOfSupply: doc.placeOfSupply,
      gstin: doc.gstin,
      gstRegistrationType: doc.gstRegistrationType,
    });
    if (bucket === "not_applicable") continue;
    // `doc.buyerStateCode` is guaranteed non-null here: `bucket` is only "unregistered"/
    // "composition" when `placeOfSupply === "inter_state"`, which always carries a
    // resolved state per `OutwardSupplyDocument`'s own contract.
    const stateCode = doc.buyerStateCode!;
    const byState = bucket === "unregistered" ? unregisteredByState : compositionByState;
    const entry = byState.get(stateCode) ?? { buyerStateCode: stateCode, netTaxableValue: 0, netIgstAmount: 0, documentIds: [] };
    entry.netTaxableValue += sign * doc.taxableValue;
    entry.netIgstAmount += sign * doc.igstAmount;
    entry.documentIds.push(doc.documentId);
    byState.set(stateCode, entry);
  }

  return {
    outwardTaxableOther,
    outwardZeroRated,
    interStateToUnregistered: [...unregisteredByState.values()].sort((a, b) => a.buyerStateCode.localeCompare(b.buyerStateCode)),
    interStateToComposition: [...compositionByState.values()].sort((a, b) => a.buyerStateCode.localeCompare(b.buyerStateCode)),
    excludedUnknownPlaceOfSupply,
  };
}
