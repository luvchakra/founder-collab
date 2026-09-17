import { describe, expect, it } from "vitest";
import { checkBalanced } from "./balance";
import { hasAccountingConsequence, idempotencyKeyFor, type FinanceEvent, type FinanceEventType } from "./events";
import { planCogsPosting, planPosting, type PostingPlan } from "./posting-rules";

const base = {
  businessId: "b1",
  sourceEntityId: "e1",
  occurredAt: "2026-09-17T00:00:00Z",
};

function event(type: FinanceEventType, over: Partial<FinanceEvent> = {}): FinanceEvent {
  return {
    ...base,
    type,
    sourceModule: "service",
    sourceEntityType: "invoice",
    ...over,
  } as FinanceEvent;
}

/** Every posting this engine emits must balance -- asserted on each rule individually
 * below, and again here so a rule added later cannot skip the check. */
function expectBalanced(result: ReturnType<typeof planPosting>): PostingPlan {
  expect(result.posted, "posted" in result && !result.posted ? result.reason : undefined).toBe(true);
  const plan = result as PostingPlan;
  const check = checkBalanced(plan.lines.map((l) => ({ accountId: l.role, debit: l.debit, credit: l.credit })));
  expect(check.balanced, check.errors.join(" ")).toBe(true);
  return plan;
}

const sum = (plan: PostingPlan, role: string, side: "debit" | "credit") =>
  plan.lines.filter((l) => l.role === role).reduce((s, l) => s + l[side], 0);

describe("idempotency", () => {
  it("derives the same key for a redelivered event", () => {
    const e = event("invoice.finalized");
    expect(idempotencyKeyFor(e)).toBe(idempotencyKeyFor({ ...e }));
  });

  it("gives different events on the same document different keys", () => {
    expect(idempotencyKeyFor(event("invoice.finalized"))).not.toBe(
      idempotencyKeyFor(event("invoice.voided")),
    );
  });

  it("keeps the COGS half of a sale distinct from its revenue posting", () => {
    const e = event("invoice.finalized", { taxableValue: 1000, total: 1000, cost: 400 });
    const revenue = expectBalanced(planPosting(e));
    const cogs = planCogsPosting(e) as PostingPlan;
    expect(cogs.idempotencyKey).not.toBe(revenue.idempotencyKey);
  });
});

describe("events with no accounting consequence", () => {
  // Discovery is commercial, not financial: winning an opportunity moves no money.
  it("never posts for Discovery activity", () => {
    const won = event("opportunity.won", { sourceModule: "discovery", sourceEntityType: "opportunity" });
    expect(hasAccountingConsequence(won)).toBe(false);
    const result = planPosting(won);
    expect(result.posted).toBe(false);
    if (!result.posted) expect(result.reason).toMatch(/commercial/i);
  });

  it("does not post revenue merely because a job was completed", () => {
    const result = planPosting(event("service.job.completed", { sourceEntityType: "job", total: 5000 }));
    expect(result.posted).toBe(false);
  });

  it("does not post for stock being issued -- the sale's own entry carries that", () => {
    expect(planPosting(event("inventory.issued", { sourceModule: "inventory" })).posted).toBe(false);
  });
});

describe("selling", () => {
  const invoice = event("invoice.finalized", {
    taxableValue: 1000,
    tax: { cgst: 90, sgst: 90 },
    total: 1180,
  });

  it("debits the customer for the gross and credits net revenue plus output GST", () => {
    const plan = expectBalanced(planPosting(invoice));
    expect(sum(plan, "accounts_receivable", "debit")).toBe(1180);
    expect(sum(plan, "service_revenue", "credit")).toBe(1000);
    expect(sum(plan, "gst_payable", "credit")).toBe(180);
  });

  it("splits GST into its own lines so the tax ledger reconciles to the journal", () => {
    const plan = expectBalanced(planPosting(invoice));
    const taxLines = plan.lines.filter((l) => l.gstAmount);
    expect(taxLines.map((l) => l.taxCode).sort()).toEqual(["CGST", "SGST"]);
    expect(taxLines.reduce((s, l) => s + (l.gstAmount ?? 0), 0)).toBe(180);
  });

  it("posts IGST as a single line for an inter-state supply", () => {
    const plan = expectBalanced(
      planPosting(event("invoice.finalized", { taxableValue: 1000, tax: { igst: 180 }, total: 1180 })),
    );
    expect(plan.lines.filter((l) => l.taxCode).map((l) => l.taxCode)).toEqual(["IGST"]);
  });

  it("handles a zero-rated invoice with no tax lines at all", () => {
    const plan = expectBalanced(
      planPosting(event("invoice.finalized", { taxableValue: 1000, total: 1000 })),
    );
    expect(plan.lines.some((l) => l.taxCode)).toBe(false);
    expect(sum(plan, "accounts_receivable", "debit")).toBe(1000);
  });

  it("posts product revenue when the caller says the sale was goods", () => {
    const plan = expectBalanced(
      planPosting(event("invoice.finalized", {
        sourceModule: "inventory",
        taxableValue: 500,
        total: 500,
        valueAccountRole: "product_revenue",
      })),
    );
    expect(sum(plan, "product_revenue", "credit")).toBe(500);
  });

  // The original entry stands and is offset, so the audit trail keeps both.
  it("reverses receivable, revenue and tax on a credit note", () => {
    const plan = expectBalanced(
      planPosting(event("credit_note.created", { taxableValue: 1000, tax: { cgst: 90, sgst: 90 }, total: 1180 })),
    );
    expect(sum(plan, "accounts_receivable", "credit")).toBe(1180);
    expect(sum(plan, "service_revenue", "debit")).toBe(1000);
    expect(sum(plan, "gst_payable", "debit")).toBe(180);
  });

  it("adds to the customer's balance on a debit note", () => {
    const plan = expectBalanced(
      planPosting(event("debit_note.created", { taxableValue: 200, tax: { igst: 36 }, total: 236 })),
    );
    expect(sum(plan, "accounts_receivable", "debit")).toBe(236);
  });
});

describe("money moving", () => {
  it("settles the receivable rather than booking revenue twice", () => {
    const plan = expectBalanced(planPosting(event("payment.received", { total: 1180, sourceEntityType: "payment" })));
    expect(sum(plan, "bank", "debit")).toBe(1180);
    expect(sum(plan, "accounts_receivable", "credit")).toBe(1180);
    expect(plan.lines.some((l) => l.role.includes("revenue"))).toBe(false);
  });

  it("posts a cash payment to cash when told to", () => {
    const plan = expectBalanced(
      planPosting(event("payment.received", { total: 500, settlementAccountRole: "cash" })),
    );
    expect(sum(plan, "cash", "debit")).toBe(500);
  });

  it("reopens the receivable on a refund", () => {
    const plan = expectBalanced(planPosting(event("payment.refunded", { total: 300 })));
    expect(sum(plan, "accounts_receivable", "debit")).toBe(300);
    expect(sum(plan, "bank", "credit")).toBe(300);
  });

  it("settles the payable when a supplier is paid", () => {
    const plan = expectBalanced(
      planPosting(event("supplier_bill.paid", { sourceModule: "inventory", total: 2360 })),
    );
    expect(sum(plan, "accounts_payable", "debit")).toBe(2360);
    expect(sum(plan, "bank", "credit")).toBe(2360);
  });
});

describe("buying", () => {
  it("puts cost on inventory, input GST on its own account and the gross on the payable", () => {
    const plan = expectBalanced(
      planPosting(event("supplier_bill.created", {
        sourceModule: "inventory",
        sourceEntityType: "bill",
        taxableValue: 2000,
        tax: { cgst: 180, sgst: 180 },
        total: 2360,
      })),
    );
    expect(sum(plan, "inventory_asset", "debit")).toBe(2000);
    expect(sum(plan, "input_gst", "debit")).toBe(360);
    expect(sum(plan, "accounts_payable", "credit")).toBe(2360);
  });

  it("labels input tax as input, not output", () => {
    const plan = expectBalanced(
      planPosting(event("supplier_bill.created", { taxableValue: 100, tax: { igst: 18 }, total: 118 })),
    );
    expect(plan.lines.find((l) => l.taxCode)?.memo).toMatch(/^Input/);
  });

  it("posts an expense to the account the caller chose", () => {
    const plan = expectBalanced(
      planPosting(event("expense.created", {
        sourceEntityType: "expense",
        taxableValue: 800,
        total: 800,
        valueAccountRole: "service_revenue",
      })),
    );
    expect(sum(plan, "service_revenue", "debit")).toBe(800);
  });

  it("swaps stock for a payable on goods receipt, with no tax until the bill arrives", () => {
    const plan = expectBalanced(
      planPosting(event("inventory.received", { sourceModule: "inventory", cost: 1500 })),
    );
    expect(sum(plan, "inventory_asset", "debit")).toBe(1500);
    expect(plan.lines.some((l) => l.taxCode)).toBe(false);
  });

  it("reverses stock and payable on a purchase return", () => {
    const plan = expectBalanced(
      planPosting(event("inventory.returned", { sourceModule: "inventory", cost: 400 })),
    );
    expect(sum(plan, "inventory_asset", "credit")).toBe(400);
    expect(sum(plan, "accounts_payable", "debit")).toBe(400);
  });
});

describe("cost of goods sold", () => {
  it("moves cost out of stock when the sale has one", () => {
    const plan = planCogsPosting(event("invoice.finalized", { cost: 600 })) as PostingPlan;
    expect(plan.posted).toBe(true);
    expect(sum(plan, "product_cogs", "debit")).toBe(600);
    expect(sum(plan, "inventory_asset", "credit")).toBe(600);
  });

  // Revenue and COGS are independent decisions: a service business posts the first and
  // not the second.
  it("posts nothing when no cost is recorded", () => {
    const result = planCogsPosting(event("invoice.finalized", {}));
    expect(result.posted).toBe(false);
  });
});

describe("rule metadata", () => {
  it("stamps the rule and version that produced the entry", () => {
    const plan = expectBalanced(planPosting(event("invoice.finalized", { taxableValue: 100, total: 100 })));
    expect(plan.ruleKey).toBe("invoice.finalized");
    expect(plan.ruleVersion).toBeGreaterThan(0);
  });

  it("explains the entry in plain language for the audit panel", () => {
    const plan = expectBalanced(
      planPosting(event("invoice.finalized", { taxableValue: 1000, tax: { cgst: 90, sgst: 90 }, total: 1180 })),
    );
    expect(plan.explanation).toContain("1180");
    expect(plan.explanation).toContain("1000");
  });

  it("rounds to paise so a posting never lands a fraction out of balance", () => {
    const plan = expectBalanced(
      planPosting(event("invoice.finalized", { taxableValue: 0.1 + 0.2, total: 0.1 + 0.2 })),
    );
    expect(sum(plan, "accounts_receivable", "debit")).toBe(0.3);
  });
});

describe("documents with no value", () => {
  it("says plainly that there is nothing to post, rather than blaming the rule", () => {
    const result = planPosting(event("invoice.finalized", { taxableValue: 0, total: 0 }));
    expect(result.posted).toBe(false);
    if (!result.posted) {
      expect(result.reason).toMatch(/no value/i);
      expect(result.reason).not.toMatch(/unbalanced/i);
    }
  });
});
