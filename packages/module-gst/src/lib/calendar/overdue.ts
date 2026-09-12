import type { FilingObligation, PaymentObligation } from "./types";

/**
 * COMPLY-P0-09.4 (Overdue Detection): pure -- compares an already-computed due date
 * (COMPLY-P0-09.1/09.2) against `asOf` and the obligation's own already-recorded
 * lifecycle/payment status. Never re-derives the due date or re-fetches anything itself.
 *
 * Three-way result, not a boolean, because one real case in this domain genuinely cannot
 * be answered true/false: a QRMP `"installment"` `PaymentObligation` has no persisted
 * payment status anywhere in this platform (see `queries.ts`'s own docstring on why) --
 * claiming it is "not overdue" once its due date has passed would be exactly the kind of
 * unverified compliance claim backlog rule 11 forbids, and claiming it IS overdue would be
 * an equally unverified claim in the other direction. `"unknown"` says so honestly instead
 * of guessing either way.
 */
export type OverdueStatus = "overdue" | "not_overdue" | "unknown";

export type OverdueResult = {
  status: OverdueStatus;
  /** Calendar days between `dueDate` and `asOf` -- positive only when `status ===
   * "overdue"`, otherwise `null`. */
  daysOverdue: number | null;
  reason: string;
};

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/** A return filing is overdue when its own due date has passed and it has not yet
 * reached `"filed"` -- any earlier stage (including never having been started, `status
 * === null`) counts, since none of them represent the return actually having been
 * submitted to the government. */
export function isFilingOverdue(obligation: FilingObligation, asOf: string): OverdueResult {
  const isPastDue = asOf > obligation.dueDate;
  if (!isPastDue) {
    return { status: "not_overdue", daysOverdue: null, reason: `Due ${obligation.dueDate}, not yet due.` };
  }
  if (obligation.status === "filed") {
    return { status: "not_overdue", daysOverdue: null, reason: `Filed on or before its ${obligation.dueDate} due date.` };
  }
  const daysOverdue = daysBetween(obligation.dueDate, asOf);
  const stageDescription = obligation.status ? `still "${obligation.status}"` : "not yet started";
  return {
    status: "overdue",
    daysOverdue,
    reason: `Was due ${obligation.dueDate} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago) and is ${stageDescription}.`,
  };
}

/** A tax payment is overdue when its own due date has passed and it has not been
 * recorded `"paid"`. See this file's own top docstring for why a `"installment"`
 * obligation (no persisted payment status at all) always resolves to `"unknown"` rather
 * than a guessed true/false. */
export function isPaymentOverdue(obligation: PaymentObligation, asOf: string): OverdueResult {
  const isPastDue = asOf > obligation.dueDate;

  if (obligation.kind === "installment") {
    if (!isPastDue) return { status: "not_overdue", daysOverdue: null, reason: `Due ${obligation.dueDate}, not yet due.` };
    return {
      status: "unknown",
      daysOverdue: null,
      reason: "This platform does not track PMT-06 installment payments, so overdue status cannot be determined -- only the due date is shown.",
    };
  }

  if (!isPastDue) {
    return { status: "not_overdue", daysOverdue: null, reason: `Due ${obligation.dueDate}, not yet due.` };
  }
  if (obligation.paymentStatus === "paid") {
    return { status: "not_overdue", daysOverdue: null, reason: `Paid on or before its ${obligation.dueDate} due date.` };
  }
  const daysOverdue = daysBetween(obligation.dueDate, asOf);
  const statusDescription = obligation.paymentStatus ?? "not recorded";
  return {
    status: "overdue",
    daysOverdue,
    reason: `Was due ${obligation.dueDate} (${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago) and payment status is "${statusDescription}".`,
  };
}
