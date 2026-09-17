import { describe, expect, it } from "vitest";
import { AGING_BUCKETS, agingBucket, documentBalance, summariseAging } from "./aging";

const asOf = new Date("2026-09-17T12:00:00Z");
const daysBefore = (n: number) => new Date(Date.UTC(2026, 8, 17 - n));

describe("agingBucket", () => {
  it("treats an item due today as current, not overdue", () => {
    expect(agingBucket(daysBefore(0), asOf)).toBe("current");
  });

  it("treats an item due in the future as current", () => {
    expect(agingBucket(new Date(Date.UTC(2026, 9, 30)), asOf)).toBe("current");
  });

  it("buckets by how many days past due", () => {
    expect(agingBucket(daysBefore(1), asOf)).toBe("1-30");
    expect(agingBucket(daysBefore(30), asOf)).toBe("1-30");
    expect(agingBucket(daysBefore(31), asOf)).toBe("31-60");
    expect(agingBucket(daysBefore(60), asOf)).toBe("31-60");
    expect(agingBucket(daysBefore(61), asOf)).toBe("61-90");
    expect(agingBucket(daysBefore(90), asOf)).toBe("61-90");
    expect(agingBucket(daysBefore(91), asOf)).toBe("90+");
    expect(agingBucket(daysBefore(400), asOf)).toBe("90+");
  });

  it("ignores time of day -- an invoice due this morning is not yet a day late", () => {
    expect(agingBucket(new Date("2026-09-17T09:00:00Z"), asOf)).toBe("current");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(agingBucket("2026-09-01", asOf)).toBe("1-30"); // 16 days
    expect(agingBucket("2026-08-01", asOf)).toBe("31-60"); // 47 days
  });

  // Guessing a due date would invent overdue debt that nobody actually owes.
  it("treats a missing or unparseable due date as current", () => {
    expect(agingBucket(null, asOf)).toBe("current");
    expect(agingBucket(undefined, asOf)).toBe("current");
    expect(agingBucket("not-a-date", asOf)).toBe("current");
  });
});

describe("summariseAging", () => {
  it("splits outstanding amounts across the buckets", () => {
    const summary = summariseAging(
      [
        { outstanding: 1000, dueDate: daysBefore(0) },
        { outstanding: 500, dueDate: daysBefore(10) },
        { outstanding: 250, dueDate: daysBefore(45) },
        { outstanding: 125, dueDate: daysBefore(75) },
        { outstanding: 75, dueDate: daysBefore(120) },
      ],
      asOf,
    );

    expect(summary.buckets).toEqual({
      current: 1000,
      "1-30": 500,
      "31-60": 250,
      "61-90": 125,
      "90+": 75,
    });
    expect(summary.totalOutstanding).toBe(1950);
    expect(summary.overdue).toBe(950);
    expect(summary.notYetDue).toBe(1000);
    expect(summary.count).toBe(5);
  });

  it("ignores settled and credit-balance documents", () => {
    const summary = summariseAging(
      [
        { outstanding: 0, dueDate: daysBefore(40) },
        { outstanding: -500, dueDate: daysBefore(40) },
        { outstanding: 100, dueDate: daysBefore(40) },
      ],
      asOf,
    );
    expect(summary.totalOutstanding).toBe(100);
    expect(summary.count).toBe(1);
  });

  it("returns zeroed buckets for an empty ledger rather than an empty object", () => {
    const summary = summariseAging([], asOf);
    for (const bucket of AGING_BUCKETS) expect(summary.buckets[bucket]).toBe(0);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.count).toBe(0);
  });

  it("does not let float accumulation leak into the totals", () => {
    const summary = summariseAging(
      [
        { outstanding: 0.1, dueDate: daysBefore(5) },
        { outstanding: 0.2, dueDate: daysBefore(5) },
      ],
      asOf,
    );
    expect(summary.totalOutstanding).toBe(0.3);
    expect(summary.overdue).toBe(0.3);
  });

  it("keeps the bucket sum equal to the reported total", () => {
    const summary = summariseAging(
      [
        { outstanding: 33.33, dueDate: daysBefore(0) },
        { outstanding: 33.33, dueDate: daysBefore(31) },
        { outstanding: 33.34, dueDate: daysBefore(95) },
      ],
      asOf,
    );
    const bucketSum = AGING_BUCKETS.reduce((s, b) => s + summary.buckets[b], 0);
    expect(Math.round(bucketSum * 100) / 100).toBe(summary.totalOutstanding);
  });
});

describe("documentBalance", () => {
  it("reports an untouched invoice as unpaid for its full value", () => {
    expect(documentBalance(1180, 0)).toEqual({ outstanding: 1180, overpaid: 0, status: "unpaid" });
  });

  it("reports a partial payment", () => {
    expect(documentBalance(1180, 500)).toEqual({
      outstanding: 680,
      overpaid: 0,
      status: "partially_paid",
    });
  });

  it("reports an exactly settled invoice as paid", () => {
    expect(documentBalance(1180, 1180)).toEqual({ outstanding: 0, overpaid: 0, status: "paid" });
  });

  // Money received beyond what was billed is held on account, not revenue.
  it("reports an overpayment as money held rather than negative debt", () => {
    expect(documentBalance(1180, 1500)).toEqual({
      outstanding: 0,
      overpaid: 320,
      status: "overpaid",
    });
  });

  it("reduces what is owed by a credit note without money moving", () => {
    expect(documentBalance(1180, 0, 180)).toEqual({
      outstanding: 1000,
      overpaid: 0,
      status: "unpaid",
    });
  });

  // The spec's edge case: a credit note issued after the invoice was already paid in
  // full leaves the customer in credit, not the invoice unpaid.
  it("handles a credit note issued after full payment", () => {
    expect(documentBalance(1180, 1180, 180)).toEqual({
      outstanding: 0,
      overpaid: 180,
      status: "overpaid",
    });
  });

  // A refund is a negative allocation: money going back out reopens the balance rather
  // than creating a separate document to track.
  it("reopens the balance when a payment is refunded", () => {
    expect(documentBalance(1180, 1180 - 500)).toEqual({
      outstanding: 500,
      overpaid: 0,
      status: "partially_paid",
    });
  });

  it("does not report a rounding artefact as an overpayment", () => {
    const balance = documentBalance(0.3, 0.1 + 0.2);
    expect(balance.status).toBe("paid");
    expect(balance.outstanding).toBe(0);
    expect(balance.overpaid).toBe(0);
  });

  it("treats a zero-value document with nothing applied as settled", () => {
    expect(documentBalance(0, 0).status).toBe("paid");
  });
});
