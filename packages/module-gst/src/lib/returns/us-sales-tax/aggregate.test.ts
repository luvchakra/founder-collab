import { describe, expect, it } from "vitest";
import { aggregateUsSalesTaxReturn } from "./aggregate";
import type { ResolvedUsSaleLine } from "./types";

function line(overrides: Partial<ResolvedUsSaleLine> = {}): ResolvedUsSaleLine {
  return {
    documentId: "doc-1",
    docType: "invoice",
    partyId: "party-1",
    itemId: "item-1",
    category: "general",
    taxableAmount: 100,
    resolved: true,
    treatment: "standard",
    ratePercent: 7.25,
    taxAmount: 7.25,
    exemptionReason: null,
    exemptionCertificateId: null,
    ruleRefs: ["rule-1"],
    ...overrides,
  };
}

describe("aggregateUsSalesTaxReturn", () => {
  it("sums a single taxable line into grossSales/taxableSales/taxCollected", () => {
    const result = aggregateUsSalesTaxReturn("biz-1", "CA", "2026-01-01", "2026-01-31", [line()], []);
    expect(result).toMatchObject({
      businessId: "biz-1",
      jurisdiction: "CA",
      grossSales: 100,
      taxableSales: 100,
      exemptSales: 0,
      unresolvedSales: 0,
      taxCollected: 7.25,
    });
  });

  it("buckets a certificate-exempt line separately from a product-taxability-exempt one", () => {
    const result = aggregateUsSalesTaxReturn(
      "biz-1",
      "PA",
      "2026-01-01",
      "2026-01-31",
      [
        line({ documentId: "doc-2", taxableAmount: 50, treatment: "exempt", ratePercent: 0, taxAmount: 0, exemptionReason: "certificate" }),
        line({ documentId: "doc-3", taxableAmount: 30, treatment: "exempt", ratePercent: 0, taxAmount: 0, exemptionReason: "product_taxability" }),
        line({ documentId: "doc-4", taxableAmount: 10, treatment: "exempt", ratePercent: 0, taxAmount: 0, exemptionReason: "line_not_taxable" }),
      ],
      [],
    );
    expect(result.exemptSales).toBe(90);
    expect(result.exemptSalesByReason).toEqual({ certificate: 50, productTaxability: 30, lineNotTaxable: 10 });
    expect(result.taxableSales).toBe(0);
    expect(result.grossSales).toBe(90);
  });

  it("an unresolved line contributes to grossSales and unresolvedSales, never taxable or exempt", () => {
    const result = aggregateUsSalesTaxReturn(
      "biz-1",
      "TX",
      "2026-01-01",
      "2026-01-31",
      [line({ documentId: "doc-5", taxableAmount: 40, resolved: false, treatment: null, ratePercent: null, taxAmount: null })],
      [],
    );
    expect(result).toMatchObject({ grossSales: 40, unresolvedSales: 40, taxableSales: 0, exemptSales: 0, taxCollected: 0 });
  });

  it("a credit note's own SIGNED negative amount subtracts from every total, matching the invoice-line sign convention", () => {
    const result = aggregateUsSalesTaxReturn(
      "biz-1",
      "CA",
      "2026-01-01",
      "2026-01-31",
      [
        line({ documentId: "doc-6", taxableAmount: 100, taxAmount: 7.25 }),
        line({ documentId: "doc-7", docType: "credit_note", taxableAmount: -20, taxAmount: -1.45 }),
      ],
      [],
    );
    expect(result.grossSales).toBe(80);
    expect(result.taxableSales).toBe(80);
    expect(result.taxCollected).toBeCloseTo(5.8, 5);
  });

  it("passes notModeled through unchanged", () => {
    const result = aggregateUsSalesTaxReturn("biz-1", "CA", "2026-01-01", "2026-01-31", [], ["a gap"]);
    expect(result.notModeled).toEqual(["a gap"]);
  });

  it("an empty line list produces all-zero totals", () => {
    const result = aggregateUsSalesTaxReturn("biz-1", "CA", "2026-01-01", "2026-01-31", [], []);
    expect(result).toMatchObject({ grossSales: 0, exemptSales: 0, taxableSales: 0, unresolvedSales: 0, taxCollected: 0 });
    expect(result.exemptSalesByReason).toEqual({ certificate: 0, productTaxability: 0, lineNotTaxable: 0 });
  });
});
