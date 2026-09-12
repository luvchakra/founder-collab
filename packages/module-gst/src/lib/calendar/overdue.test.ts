import { describe, expect, it } from "vitest";
import { isFilingOverdue, isPaymentOverdue } from "./overdue";
import type { FilingObligation, PaymentObligation } from "./types";

function filingObligation(overrides: Partial<FilingObligation> = {}): FilingObligation {
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

function paymentObligation(overrides: Partial<PaymentObligation> = {}): PaymentObligation {
  return {
    kind: "settlement",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    dueDate: "2026-09-20",
    paymentStatus: null,
    paymentDate: null,
    ...overrides,
  };
}

describe("isFilingOverdue", () => {
  it("is not overdue before the due date", () => {
    expect(isFilingOverdue(filingObligation(), "2026-09-10").status).toBe("not_overdue");
  });

  it("is not overdue exactly on the due date", () => {
    expect(isFilingOverdue(filingObligation(), "2026-09-20").status).toBe("not_overdue");
  });

  it("is overdue the day after the due date when never started", () => {
    const result = isFilingOverdue(filingObligation({ status: null }), "2026-09-21");
    expect(result.status).toBe("overdue");
    expect(result.daysOverdue).toBe(1);
  });

  it("is overdue when stuck in an earlier lifecycle stage past due date", () => {
    const result = isFilingOverdue(filingObligation({ status: "in_review" }), "2026-10-05");
    expect(result.status).toBe("overdue");
    expect(result.daysOverdue).toBe(15);
    expect(result.reason).toContain("in_review");
  });

  it("is never overdue once filed, even long past the due date", () => {
    expect(isFilingOverdue(filingObligation({ status: "filed" }), "2026-12-01").status).toBe("not_overdue");
  });
});

describe("isPaymentOverdue", () => {
  it("settlement: not overdue before the due date", () => {
    expect(isPaymentOverdue(paymentObligation(), "2026-09-10").status).toBe("not_overdue");
  });

  it("settlement: overdue past due date with no recorded payment", () => {
    const result = isPaymentOverdue(paymentObligation({ paymentStatus: "pending" }), "2026-09-25");
    expect(result.status).toBe("overdue");
    expect(result.daysOverdue).toBe(5);
  });

  it("settlement: not overdue once marked paid, even past due date", () => {
    expect(isPaymentOverdue(paymentObligation({ paymentStatus: "paid" }), "2026-12-01").status).toBe("not_overdue");
  });

  it("installment: not overdue before its own due date", () => {
    expect(isPaymentOverdue(paymentObligation({ kind: "installment" }), "2026-09-10").status).toBe("not_overdue");
  });

  it("installment: unknown (never overdue/not-overdue) once past due date, since no payment status is ever tracked", () => {
    const result = isPaymentOverdue(paymentObligation({ kind: "installment" }), "2026-09-25");
    expect(result.status).toBe("unknown");
    expect(result.daysOverdue).toBeNull();
  });
});
