import type { ReturnType, ReturnPeriodStatus } from "../returns/lifecycle/types";
import type { GstReturnFrequency } from "../tax-registrations/gst-registration-profile";

/**
 * COMPLY-P0-09.1 (Filing Calendar) / COMPLY-P0-09.2 (Payment Calendar) / COMPLY-P0-09.4
 * (Overdue Detection): the shapes shared across this whole `lib/calendar/` folder.
 *
 * Deliberately scoped to this platform's own existing "single primary registration"
 * simplification (same one `lib/returns/{gstr1,gstr3b,gstr9}` already document): a real
 * business may hold several GSTINs (`gst.tax_registrations`), but every "prepare a
 * return" function in this module computes ONE return per business/period, not one per
 * GSTIN -- the Filing Calendar follows the same simplification rather than inventing a
 * per-registration calendar this module's own return preparers don't support yet.
 */

/** Which of the two India GST "Category X"/"Category Y" QRMP due-date groups a
 * registered place of supply state falls into -- see the seeded `gstr3b_filing_due_dates`
 * tax rule's own `source` citation for where this split comes from. `null` when the
 * business's own jurisdiction isn't recognized against either list (e.g. no jurisdiction
 * on file yet) -- a real, honest "we don't know" rather than a silent guess. */
export type QrmpStateCategory = "X" | "Y" | null;

export type FilingObligation = {
  returnType: ReturnType;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  /** The lifecycle status of the matching `gst.return_periods` row, or `null` when no
   * such row has been created yet -- a real, common state (nobody has started drafting
   * this period), not an error. */
  status: ReturnPeriodStatus | null;
  returnPeriodId: string | null;
};

/** COMPLY-P0-09.2 (Payment Calendar): a tax PAYMENT obligation, distinct from the RETURN
 * filing obligation above -- a QRMP quarterly filer owes two PMT-06 installment payments
 * (no return filed for those) before the quarter's own GSTR-3B settles the balance.
 * `kind: "settlement"` always corresponds 1:1 with a GSTR-3B `FilingObligation` for the
 * same period (its own due date IS the payment due date for a monthly filer, or the
 * quarter's own final GSTR-3B due date for a QRMP filer); `kind: "installment"` has no
 * corresponding return at all. Deliberately carries no payment AMOUNT -- see this
 * folder's own `queries.ts` docstring for why (this module does not compute a real
 * self-assessed or 35%-of-last-quarter liability figure anywhere). */
export type PaymentObligation = {
  kind: "installment" | "settlement";
  /** The quarter (or month, for a monthly filer's settlement) this payment belongs to. */
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  /** Reuses `gst.return_periods.payment_status`/`payment_date` for a `"settlement"`
   * obligation (the same row the matching GSTR-3B `FilingObligation` already resolves) --
   * always `null` for an `"installment"`, since no table tracks PMT-06 payments at all
   * (see `queries.ts`'s own docstring). */
  paymentStatus: "not_applicable" | "pending" | "paid" | null;
  paymentDate: string | null;
};

export type FilingCalendarInput = {
  returnFrequency: GstReturnFrequency;
  /** The business's own primary registration jurisdiction (state), used only to resolve
   * the GSTR-3B QRMP Category X/Y due day -- irrelevant for a monthly filer. */
  jurisdiction: string | null;
};
