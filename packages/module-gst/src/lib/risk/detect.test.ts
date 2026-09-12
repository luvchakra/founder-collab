import { describe, expect, it } from "vitest";
import { detectReturnNotApprovedSignals, detectEinvoiceDeadlineSignals, detectUnmatchedItcSignals, detectMissingRegistrationSignal, detectInvalidClassificationSignals, EINVOICE_DEADLINE_APPROACHING_DAYS } from "./detect";
import type { FilingObligation } from "../calendar/types";
import type { ReconciliationException } from "../exceptions/types";
import type { ItemTaxContext } from "../inventory-tax-context/types";

function obligation(overrides: Partial<FilingObligation> = {}): FilingObligation {
  return {
    returnType: "gstr3b",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    dueDate: "2026-09-20",
    status: null,
    returnPeriodId: null,
    ...overrides,
  };
}

describe("detectReturnNotApprovedSignals", () => {
  it("flags an overdue, not-yet-approved obligation", () => {
    const signals = detectReturnNotApprovedSignals([obligation({ status: "in_review" })], "2026-10-01");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "return_not_approved", severity: "high" });
  });

  it("does not flag an obligation not yet due", () => {
    expect(detectReturnNotApprovedSignals([obligation()], "2026-09-01")).toEqual([]);
  });

  it("does not flag an overdue obligation that is already approved", () => {
    expect(detectReturnNotApprovedSignals([obligation({ status: "approved" })], "2026-10-01")).toEqual([]);
  });

  it("does not flag an overdue obligation that is already filed", () => {
    expect(detectReturnNotApprovedSignals([obligation({ status: "filed" })], "2026-10-01")).toEqual([]);
  });

  it("flags a never-started (status null) overdue obligation", () => {
    const signals = detectReturnNotApprovedSignals([obligation({ status: null })], "2026-10-01");
    expect(signals).toHaveLength(1);
    expect(signals[0]?.summary).toContain("not started");
  });
});

describe("detectEinvoiceDeadlineSignals", () => {
  it("flags a breached deadline as high severity", () => {
    const signals = detectEinvoiceDeadlineSignals([{ documentId: "doc-1", docNumber: "INV-1", deadlineStatus: "deadline_breached", deadline: "2026-09-01" }], "2026-09-10");
    expect(signals).toEqual([expect.objectContaining({ kind: "einvoice_deadline", severity: "high", relatedEntityId: "doc-1" })]);
  });

  it("flags a within-window deadline as medium severity once inside the approaching threshold", () => {
    const signals = detectEinvoiceDeadlineSignals([{ documentId: "doc-2", docNumber: "INV-2", deadlineStatus: "within_window", deadline: "2026-09-12" }], "2026-09-10");
    expect(signals).toEqual([expect.objectContaining({ kind: "einvoice_deadline", severity: "medium" })]);
  });

  it("does not flag a within-window deadline still far out", () => {
    const farOutDeadline = "2026-10-10"; // well beyond EINVOICE_DEADLINE_APPROACHING_DAYS from 2026-09-10
    expect(EINVOICE_DEADLINE_APPROACHING_DAYS).toBeLessThan(30);
    expect(detectEinvoiceDeadlineSignals([{ documentId: "doc-3", docNumber: null, deadlineStatus: "within_window", deadline: farOutDeadline }], "2026-09-10")).toEqual([]);
  });

  it("does not flag not_restricted or unknown candidates (queries.ts filters these before this function even runs, but it's still safe on its own)", () => {
    expect(
      detectEinvoiceDeadlineSignals(
        [
          { documentId: "doc-4", docNumber: null, deadlineStatus: "not_restricted", deadline: null },
          { documentId: "doc-5", docNumber: null, deadlineStatus: "unknown", deadline: null },
        ],
        "2026-09-10",
      ),
    ).toEqual([]);
  });
});

function exception(overrides: Partial<ReconciliationException> = {}): ReconciliationException {
  return {
    id: "exc-1",
    businessId: "biz-1",
    returnPeriod: "2026-08",
    exceptionType: "supplier_mismatch",
    referenceKey: "29ABCDE1234F1Z5",
    summary: "Taxable value mismatch of ₹500.",
    status: "open",
    resolutionNote: null,
    statusHistory: [],
    resolvedBy: null,
    resolvedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("detectUnmatchedItcSignals", () => {
  it("produces one medium-severity signal per open exception", () => {
    const signals = detectUnmatchedItcSignals([exception(), exception({ id: "exc-2" })]);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({ kind: "unmatched_itc", severity: "medium", relatedEntityType: "reconciliation_exception", relatedEntityId: "exc-1" });
  });

  it("produces nothing for an empty list", () => {
    expect(detectUnmatchedItcSignals([])).toEqual([]);
  });
});

describe("detectMissingRegistrationSignal", () => {
  it("flags a high-severity signal when there is no active registration", () => {
    const signals = detectMissingRegistrationSignal(false, "IN", "GST");
    expect(signals).toEqual([expect.objectContaining({ kind: "missing_tax_registration", severity: "high" })]);
  });

  it("produces nothing when an active registration exists", () => {
    expect(detectMissingRegistrationSignal(true, "IN", "GST")).toEqual([]);
  });
});

function item(overrides: Partial<ItemTaxContext> = {}): ItemTaxContext {
  return { id: "item-1", kind: "good", sku: "SKU1", name: "Widget", unit: "unit", hsnCode: "8471", taxRate: 18, status: "active", ...overrides };
}

describe("detectInvalidClassificationSignals", () => {
  it("flags an item with no HSN code", () => {
    const signals = detectInvalidClassificationSignals([item({ hsnCode: null })]);
    expect(signals).toEqual([expect.objectContaining({ kind: "invalid_classification", severity: "low", relatedEntityId: "item-1" })]);
  });

  it("flags an item with a structurally invalid HSN code", () => {
    const signals = detectInvalidClassificationSignals([item({ hsnCode: "ABC" })]);
    expect(signals).toHaveLength(1);
  });

  it("does not flag a validly classified item", () => {
    expect(detectInvalidClassificationSignals([item({ hsnCode: "8471" })])).toEqual([]);
  });

  it("does not flag a not-applicable item kind (e.g. labour, no HSN/SAC required)", () => {
    expect(detectInvalidClassificationSignals([item({ kind: "labour", hsnCode: null })])).toEqual([]);
  });
});
