import { checkBalanced } from "./balance";
import {
  hasAccountingConsequence,
  idempotencyKeyFor,
  totalTax,
  type FinanceEvent,
  type NonPostingEventType,
} from "./events";
import type { AccountRoleKey } from "./types";

/**
 * The deterministic rules layer: a financial event in, balanced journal lines out.
 *
 *   Domain event -> rule -> account resolution -> tax resolution -> lines -> validation
 *
 * Deterministic and configuration-driven on purpose. The same event, the same rule
 * version and the same account mappings always produce the same posting, which is what
 * makes an automatic entry explainable after the fact ("why was this created?") and what
 * lets a backfill re-derive history without inventing new numbers.
 *
 * Rules are versioned. A rule is never edited in place for an entry already posted:
 * changing a rule changes what *future* events produce, and the version stamped on each
 * entry records which reading of the world produced it.
 */

/** A line before account ids are resolved: roles here, uuids at the database boundary. */
export interface PlannedLine {
  role: AccountRoleKey;
  debit: number;
  credit: number;
  /** The line carrying the document's own value, as opposed to tax or the counterparty
   * balance. Marked because a hand-entered bill names the exact account its value belongs
   * to ("Rent"), which no role can express — `postFinanceEvent` substitutes it here.
   * Without this the founder picks Rent and the money lands in Inventory Asset. */
  isValueLine?: boolean;
  memo?: string;
  /** Set on the tax lines so the GST ledger can be reconciled back to the journal. */
  gstAmount?: number;
  taxCode?: string;
}

export interface PostingPlan {
  posted: true;
  idempotencyKey: string;
  ruleKey: string;
  ruleVersion: number;
  lines: PlannedLine[];
  /** Plain-language account names, for the "why was this created?" panel. */
  explanation: string;
}

export interface PostingSkipped {
  posted: false;
  reason: string;
}

export type PostingResult = PostingPlan | PostingSkipped;

/** Bumped when a rule's *meaning* changes. Historical entries keep the version they were
 * posted under, so a change here never rewrites the past. */
const RULE_VERSION = 1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Splits GST into its component lines. CGST/SGST (intra-state) and IGST (inter-state)
 * are mutually exclusive in practice, so whichever the tax engine populated is what gets
 * posted -- this function does not re-decide place of supply, it only records it. */
function taxLines(event: FinanceEvent, role: AccountRoleKey, side: "debit" | "credit"): PlannedLine[] {
  const parts: [string, number | undefined][] = [
    ["CGST", event.tax?.cgst],
    ["SGST", event.tax?.sgst],
    ["IGST", event.tax?.igst],
    ["Cess", event.tax?.cess],
  ];
  return parts
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([label, amount]) => ({
      role,
      debit: side === "debit" ? round2(amount!) : 0,
      credit: side === "credit" ? round2(amount!) : 0,
      memo: `${side === "credit" ? "Output" : "Input"} ${label}`,
      gstAmount: round2(amount!),
      taxCode: label.toUpperCase(),
    }));
}

/**
 * Builds the posting for one event, or explains why there isn't one.
 *
 * Returning a *reason* rather than throwing matters: "this event has no accounting
 * consequence" is a normal, expected outcome for most of what the operational modules
 * publish, not an error to surface to anyone.
 */
export function planPosting(event: FinanceEvent): PostingResult {
  if (!hasAccountingConsequence(event)) {
    return {
      posted: false,
      reason:
        event.sourceModule === "discovery"
          ? "Discovery activity is commercial, not financial: revenue is posted when an invoice is raised."
          : `${event.type} records work, not money moving -- no accounting entry is created.`,
    };
  }

  const tax = totalTax(event.tax);
  const idempotencyKey = idempotencyKeyFor(event);
  const settlement = event.settlementAccountRole ?? "bank";

  const finish = (
    ruleKey: string,
    lines: PlannedLine[],
    explanation: string,
  ): PostingResult => {
    const meaningful = lines.filter((l) => l.debit > 0 || l.credit > 0);
    // A document with no value is a real thing (a nil invoice, a zero-rated line that
    // nets to nothing) and it has no accounting effect. Saying so plainly keeps it out
    // of the "unbalanced rule" branch below, which is meant for actual rule bugs.
    if (meaningful.length === 0) {
      return { posted: false, reason: "The document has no value, so there is nothing to post." };
    }
    const check = checkBalanced(
      meaningful.map((l) => ({ accountId: l.role, debit: l.debit, credit: l.credit })),
    );
    if (!check.balanced) {
      // A rule that produces an unbalanced entry is a bug in the rule, not bad input --
      // say which rule, so it is findable, and never post it.
      return { posted: false, reason: `Rule ${ruleKey} produced an unbalanced entry: ${check.errors.join(" ")}` };
    }
    return { posted: true, idempotencyKey, ruleKey, ruleVersion: RULE_VERSION, lines: meaningful, explanation };
  };

  switch (event.type) {
    // Sell: the customer owes us the gross amount, we earned the net, and the tax is
    // collected on the government's behalf rather than earned.
    case "invoice.finalized": {
      const net = round2(event.taxableValue ?? 0);
      const gross = round2(event.total ?? net + tax);
      const revenue = event.valueAccountRole ?? "service_revenue";
      const lines: PlannedLine[] = [
        { role: "accounts_receivable", debit: gross, credit: 0, memo: "Invoice raised" },
        { role: revenue, debit: 0, credit: net, memo: "Revenue" },
        ...taxLines(event, "gst_payable", "credit"),
      ];
      return finish(
        "invoice.finalized",
        lines,
        `Invoice raised: receivable ${gross} against revenue ${net}${tax > 0 ? ` and output GST ${round2(tax)}` : ""}.`,
      );
    }

    // A void and a credit note are the same shape -- the original entry stands and is
    // offset, rather than being edited away, so the audit trail keeps both.
    case "invoice.voided":
    case "credit_note.created": {
      const net = round2(event.taxableValue ?? 0);
      const gross = round2(event.total ?? net + tax);
      const revenue = event.valueAccountRole ?? "service_revenue";
      const lines: PlannedLine[] = [
        { role: revenue, debit: net, credit: 0, memo: "Revenue reversed" },
        ...taxLines(event, "gst_payable", "debit"),
        { role: "accounts_receivable", debit: 0, credit: gross, memo: "Receivable reversed" },
      ];
      return finish(
        event.type,
        lines,
        `${event.type === "invoice.voided" ? "Invoice voided" : "Credit note issued"}: reverses ${gross} of receivable.`,
      );
    }

    case "debit_note.created": {
      const net = round2(event.taxableValue ?? 0);
      const gross = round2(event.total ?? net + tax);
      const revenue = event.valueAccountRole ?? "service_revenue";
      return finish(
        "debit_note.created",
        [
          { role: "accounts_receivable", debit: gross, credit: 0, memo: "Debit note raised" },
          { role: revenue, debit: 0, credit: net, memo: "Additional charge" },
          ...taxLines(event, "gst_payable", "credit"),
        ],
        `Debit note raised: adds ${gross} to the customer's balance.`,
      );
    }

    // Money in settles the receivable; it is not revenue a second time.
    case "payment.received": {
      const amount = round2(event.total ?? 0);
      return finish(
        "payment.received",
        [
          { role: settlement, debit: amount, credit: 0, memo: "Payment received" },
          { role: "accounts_receivable", debit: 0, credit: amount, memo: "Applied to receivable" },
        ],
        `Payment of ${amount} received and applied to the customer's balance.`,
      );
    }

    case "payment.refunded": {
      const amount = round2(event.total ?? 0);
      return finish(
        "payment.refunded",
        [
          { role: "accounts_receivable", debit: amount, credit: 0, memo: "Refund reopens balance" },
          { role: settlement, debit: 0, credit: amount, memo: "Refund paid out" },
        ],
        `Refund of ${amount} paid out, reopening the customer's balance.`,
      );
    }

    // Buy: we owe the supplier the gross amount, the net lands on inventory or an
    // expense, and input GST is recoverable -- an asset until it is offset, which is what
    // makes input tax credit reportable at all.
    case "supplier_bill.created":
    case "expense.created": {
      const net = round2(event.taxableValue ?? 0);
      const gross = round2(event.total ?? net + tax);
      const value = event.valueAccountRole ?? (event.type === "expense.created" ? "product_cogs" : "inventory_asset");
      const lines: PlannedLine[] = [
        {
          role: value,
          debit: net,
          credit: 0,
          isValueLine: true,
          memo: event.type === "expense.created" ? "Expense" : "Purchase",
        },
        ...taxLines(event, "input_gst", "debit"),
        { role: "accounts_payable", debit: 0, credit: gross, memo: "Payable to supplier" },
      ];
      return finish(
        event.type,
        lines,
        `${event.type === "expense.created" ? "Expense" : "Supplier bill"} recorded: ${net} of cost${tax > 0 ? ` and ${round2(tax)} recoverable input GST` : ""}, ${gross} payable.`,
      );
    }

    case "supplier_bill.paid": {
      const amount = round2(event.total ?? 0);
      return finish(
        "supplier_bill.paid",
        [
          { role: "accounts_payable", debit: amount, credit: 0, memo: "Payable settled" },
          { role: settlement, debit: 0, credit: amount, memo: "Paid to supplier" },
        ],
        `Payment of ${amount} made to the supplier.`,
      );
    }

    // Goods arriving are a swap of one asset for a liability; the bill carries the tax,
    // so a receipt on its own posts no GST.
    case "inventory.received": {
      const cost = round2(event.cost ?? event.taxableValue ?? 0);
      return finish(
        "inventory.received",
        [
          { role: "inventory_asset", debit: cost, credit: 0, memo: "Stock received" },
          { role: "accounts_payable", debit: 0, credit: cost, memo: "Goods received not invoiced" },
        ],
        `Stock worth ${cost} received into inventory.`,
      );
    }

    case "inventory.returned": {
      const cost = round2(event.cost ?? event.taxableValue ?? 0);
      return finish(
        "inventory.returned",
        [
          { role: "accounts_payable", debit: cost, credit: 0, memo: "Return to supplier" },
          { role: "inventory_asset", debit: 0, credit: cost, memo: "Stock returned" },
        ],
        `Stock worth ${cost} returned to the supplier.`,
      );
    }

    default: {
      // Exhaustiveness, stated precisely: the only types that reach here are the ones
      // `hasAccountingConsequence` already filtered out above (TypeScript cannot narrow
      // the union through that runtime check, so they remain in scope for the compiler).
      // Annotating the assignment means adding a new FinanceEventType without a rule
      // fails to compile, instead of silently posting nothing.
      const nonPosting: NonPostingEventType = event.type;
      return { posted: false, reason: `No accounting rule is defined for ${nonPosting}.` };
    }
  }
}

/**
 * The COGS half of a product sale, kept separate from the revenue posting because the
 * two are independent decisions: every sale posts revenue, but only a business running
 * perpetual inventory accounting also moves cost out of stock at the point of sale.
 */
export function planCogsPosting(event: FinanceEvent): PostingResult {
  const cost = round2(event.cost ?? 0);
  if (cost <= 0) {
    return { posted: false, reason: "No cost is recorded for these goods, so no COGS entry is created." };
  }
  const lines: PlannedLine[] = [
    { role: "product_cogs", debit: cost, credit: 0, memo: "Cost of goods sold" },
    { role: "inventory_asset", debit: 0, credit: cost, memo: "Stock relieved" },
  ];
  return {
    posted: true,
    idempotencyKey: `${idempotencyKeyFor(event)}:cogs`,
    ruleKey: "sale.cogs",
    ruleVersion: RULE_VERSION,
    lines,
    explanation: `Cost of ${cost} moved from inventory to COGS.`,
  };
}
