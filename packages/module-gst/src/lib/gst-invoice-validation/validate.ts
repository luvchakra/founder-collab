import { validateHsnSacCode } from "../inventory-tax-context/hsn-sac";
import type { ItemKind } from "../inventory-tax-context/types";
import type { DocumentContext } from "../core-transactions/types";
import type { PlaceOfSupplyTreatment } from "../place-of-supply/types";
import { isKnownGstRateSlab } from "../tax-rules/india-rate-slabs";
import type { GstInvoiceIssue, GstInvoiceValidationResult } from "./types";

/**
 * COMPLY-P0-04.6 (GST Invoice Validation). Pure: every fact this function needs
 * (the document itself, each line item's current `kind` for HSN/SAC requirement purposes,
 * and the already-resolved place-of-supply treatment) is resolved by the caller
 * (`queries.ts`'s own orchestrator) and passed in, so this stays testable without a live
 * database connection, matching this module's established convention.
 *
 * A non-`taxable` line (`core.document_lines.taxable = false` -- a note/discount line,
 * say) is skipped entirely for HSN/SAC purposes; it was never meant to carry a tax
 * classification in the first place.
 *
 * The tax-split-vs-place-of-supply cross-check is deliberately a WARNING, not an error --
 * this function reads the document's own already-recorded cgst/sgst/igst totals (a
 * snapshot from whenever the document was created) and compares them against place of
 * supply computed from the party/registration data AS THEY STAND RIGHT NOW; a party's
 * address changing after an invoice was issued would trigger this warning without the
 * original invoice having been wrong at the time, so it is surfaced for a human to look
 * at, never treated as a hard validation failure on its own.
 *
 * COMPLY-P0-04.7 (GST Rule Versioning): the line-level rate-slab check is also a WARNING,
 * never an error -- it flags a line whose snapshotted `taxRate` isn't one of the GST
 * ad-valorem slabs *currently* recognized as of the invoice date (per
 * `gst.tax_rules`'s own versioned `standard_rate_slabs` lineage,
 * `lib/tax-rules/india-rate-slabs.ts`), which is exactly the kind of fact worth a human's
 * attention rather than a hard block: a business may have a genuine negotiated/legacy
 * rate, or the rule content itself may simply not have a version for this exact date.
 * `knownRateSlabsPercent` is undefined when the caller couldn't resolve any rule for this
 * date at all (`queries.ts`'s own orchestrator) -- in that case the check is skipped
 * entirely rather than treating "we don't have rule content" as itself a finding.
 */
export function validateGstInvoiceFields(input: {
  document: DocumentContext;
  /** `itemId -> kind`, from `listItemTaxContexts` -- a line whose item isn't found here
   * (e.g. deleted since) is skipped for HSN/SAC purposes rather than flagged, since this
   * function can't know what code family would even apply. */
  lineItemKinds: Map<string, ItemKind>;
  placeOfSupply: PlaceOfSupplyTreatment;
  /** The GST rate slabs (e.g. `[0, 5, 18, 40]`) recognized as of this document's own
   * invoice date, from `gst.tax_rules`'s versioned `standard_rate_slabs` lineage --
   * `undefined` when no rule content could be resolved for that date, which skips the
   * rate-slab check rather than treating the absence of rule content as a finding. */
  knownRateSlabsPercent?: number[];
}): GstInvoiceValidationResult {
  const issues: GstInvoiceIssue[] = [];
  const { document } = input;

  if (!document.number || !document.number.trim()) {
    issues.push({
      code: "missing_invoice_number",
      severity: "error",
      message: "This invoice has no invoice number yet.",
    });
  }

  if (!document.docDate) {
    issues.push({
      code: "missing_invoice_date",
      severity: "error",
      message: "This invoice has no invoice date.",
    });
  }

  if (document.lines.length === 0) {
    issues.push({
      code: "no_lines",
      severity: "error",
      message: "This invoice has no line items.",
    });
  }

  for (const line of document.lines) {
    if (!line.taxable) continue;

    const kind = input.lineItemKinds.get(line.itemId);
    if (kind) {
      const result = validateHsnSacCode(kind, line.hsnCode);
      if (result.status === "missing") {
        issues.push({
          code: "line_hsn_sac_missing",
          severity: "error",
          message: result.reason ?? "Missing HSN/SAC code.",
          lineId: line.id,
        });
      } else if (result.status === "invalid") {
        issues.push({
          code: "line_hsn_sac_invalid",
          severity: "error",
          message: result.reason ?? "Invalid HSN/SAC code.",
          lineId: line.id,
        });
      }
    }

    if (
      input.knownRateSlabsPercent &&
      input.knownRateSlabsPercent.length > 0 &&
      !isKnownGstRateSlab(line.taxRate, input.knownRateSlabsPercent)
    ) {
      issues.push({
        code: "line_tax_rate_not_a_known_slab",
        severity: "warning",
        message: `This line's GST rate (${line.taxRate}%) is not one of the GST rate slabs currently in effect (${input.knownRateSlabsPercent
          .map((slab) => `${slab}%`)
          .join(", ")}). Confirm this rate is correct.`,
        lineId: line.id,
      });
    }
  }

  if (input.placeOfSupply === "unknown") {
    issues.push({
      code: "place_of_supply_unknown",
      severity: "error",
      message: "Place of supply could not be determined for this invoice.",
    });
  } else {
    const hasAnyTax = document.cgstAmount > 0 || document.sgstAmount > 0 || document.igstAmount > 0;
    if (hasAnyTax) {
      if (input.placeOfSupply === "intra_state" && document.igstAmount > 0) {
        issues.push({
          code: "tax_split_mismatch",
          severity: "warning",
          message: "This invoice charges IGST, but the place of supply now looks intra-state (CGST+SGST expected).",
        });
      }
      if (input.placeOfSupply === "inter_state" && (document.cgstAmount > 0 || document.sgstAmount > 0)) {
        issues.push({
          code: "tax_split_mismatch",
          severity: "warning",
          message: "This invoice charges CGST/SGST, but the place of supply now looks inter-state (IGST expected).",
        });
      }
    }
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
