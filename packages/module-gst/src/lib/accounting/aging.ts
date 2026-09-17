/**
 * Receivables and payables arithmetic, shared by A/R, A/P and the Finance dashboard.
 *
 * Deliberately pure: Finance does not own invoices or bills -- those are
 * `core.documents`, and payments are `core.payments` + `core.payment_allocations`. This
 * module turns rows that already exist into balances and aging buckets rather than
 * introducing a second copy of them to keep in sync.
 */

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

/** In reporting order, oldest last -- the order an aging table's columns appear in. */
export const AGING_BUCKETS: readonly AgingBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two dates, counted on the calendar date alone: an invoice due at
 * 09:00 and read at 17:00 the same day is not one day overdue. */
function daysOverdue(dueDate: Date, asOf: Date): number {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const now = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.floor((now - due) / MS_PER_DAY);
}

/**
 * Which aging bucket an open item falls in. Anything not yet past its due date is
 * "current", including one due today -- a bill due today is not late until the day ends.
 * An item with no due date is treated as current: absent a date, there is nothing to be
 * late against, and guessing one would invent overdue debt.
 */
export function agingBucket(dueDate: Date | string | null | undefined, asOf: Date): AgingBucket {
  if (!dueDate) return "current";
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(due.getTime())) return "current";

  const overdue = daysOverdue(due, asOf);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";
  return "90+";
}

export interface OpenItem {
  /** Whatever remains unpaid on this document. Items at zero are ignored. */
  outstanding: number;
  dueDate: Date | string | null;
}

export interface AgingSummary {
  buckets: Record<AgingBucket, number>;
  /** Everything still owed, current and overdue alike. */
  totalOutstanding: number;
  /** Past its due date -- the sum of every bucket except `current`. */
  overdue: number;
  /** Not yet due. Same figure as `buckets.current`, named for how it reads on a KPI. */
  notYetDue: number;
  count: number;
}

export function summariseAging(items: OpenItem[], asOf: Date): AgingSummary {
  const buckets: Record<AgingBucket, number> = {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let count = 0;

  for (const item of items) {
    // A fully settled document is not an open item; a credit balance belongs to the
    // credit-note flow, not to aging, so neither contributes here.
    if (item.outstanding <= 0) continue;
    buckets[agingBucket(item.dueDate, asOf)] += item.outstanding;
    count += 1;
  }

  const totalOutstanding = AGING_BUCKETS.reduce((sum, b) => sum + buckets[b], 0);
  return {
    buckets,
    totalOutstanding: round2(totalOutstanding),
    overdue: round2(totalOutstanding - buckets.current),
    notYetDue: round2(buckets.current),
    count,
  };
}

export type PaymentStatus = "unpaid" | "partially_paid" | "paid" | "overpaid";

export interface DocumentBalance {
  outstanding: number;
  /** Positive when more was received than billed -- money held on account, not revenue. */
  overpaid: number;
  status: PaymentStatus;
}

/** Sums are rounded to paise at the boundary: allocations accumulate float error, and a
 * balance that reads -0.000000001 must not present as "overpaid". */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * What a single invoice or bill still owes, given everything applied to it.
 *
 * `credited` covers credit notes (a customer's) and debit notes (a supplier's): both
 * reduce what is owed without money moving, which is why they are separate from
 * `allocated`. A refund is a negative allocation -- money going back out reopens the
 * balance rather than creating a new document.
 */
export function documentBalance(
  total: number,
  allocated: number,
  credited = 0,
): DocumentBalance {
  const net = round2(total - credited);
  const settled = round2(allocated);
  const remaining = round2(net - settled);

  if (remaining > 0) {
    return {
      outstanding: remaining,
      overpaid: 0,
      status: settled > 0 ? "partially_paid" : "unpaid",
    };
  }
  if (remaining < 0) {
    return { outstanding: 0, overpaid: Math.abs(remaining), status: "overpaid" };
  }
  // Exactly settled. A zero-value document with nothing applied reads as paid rather
  // than unpaid: there is nothing left to collect on it.
  return { outstanding: 0, overpaid: 0, status: "paid" };
}
