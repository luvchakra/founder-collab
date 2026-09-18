import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { nextNumber } from "@cofounderai/core/numbering/mutations";
import { publish } from "@cofounderai/core/events/mutations";
import { recordPayment, allocatePayment } from "@cofounderai/core/payments/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { stateCodeFromGstin } from "@cofounderai/core/lib/gst";
import { billProblems, billTotals, initialStatus, type BillInput } from "./bills";

/**
 * Records a supplier bill or a direct expense.
 *
 * Writes a `core.documents` row — the same table invoices live in — so payments, parties,
 * allocations and Payables all work on it unchanged. Header-only: `core.document_lines`
 * requires an `item_id`, which a rent bill has no answer for.
 *
 * Posting is left to the event drain rather than done inline. Finance already has one
 * path from a document to its ledger entry, with idempotency the database enforces, and a
 * second inline path would be a second place for that to be wrong. The e-invoicing
 * handler on the same event already guards on `docType === 'invoice'`, so a bill passes it
 * by without generating anything.
 */
export async function createSupplierBill(
  businessId: string,
  input: BillInput,
): Promise<{ documentId: string; total: number }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const problems = billProblems(input);
  if (problems.length > 0) throw new Error(problems.join(" "));

  const core = await createCoreClient({ schema: "core" });

  // Place of supply is decided by where the two parties are, so both states are read
  // rather than assumed. `computeLineGst` returns zeroes and says `incomplete` when
  // either is unknown, which is better than a confident wrong split.
  const [{ data: supplierTax }, { data: settings }] = await Promise.all([
    core.from("tax_identities").select("gstin").eq("party_id", input.partyId).maybeSingle(),
    core.from("business_settings").select("gstin, state").eq("business_id", businessId).maybeSingle(),
  ]);

  const supplierState = stateCodeFromGstin((supplierTax as { gstin: string | null } | null)?.gstin ?? null);
  const businessGstin = (settings as { gstin: string | null; state: string | null } | null)?.gstin ?? null;
  const businessState = stateCodeFromGstin(businessGstin);

  const totals = billTotals({
    taxableValue: input.taxableValue,
    gstRatePercent: input.gstRatePercent,
    supplierStateCode: supplierState,
    businessStateCode: businessState,
  });

  const number =
    input.billNumber?.trim() || (await nextNumber(businessId, "supplier_bill", "BILL"));

  const { data, error } = await core
    .from("documents")
    .insert({
      business_id: businessId,
      doc_type: "supplier_bill",
      source_module: "finance",
      party_id: input.partyId,
      number,
      status: initialStatus(input),
      doc_date: input.billDate,
      due_date: input.dueDate || null,
      notes: input.notes?.trim() || null,
      subtotal: totals.taxableValue,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      total_amount: totals.total,
      // Which account the value lands on, and whether this was entered as an expense
      // rather than stock. `source_ref` is the documented extension point for fields that
      // have no place on the shared table.
      source_ref: {
        kind: input.kind,
        value_account_id: input.valueAccountId,
        gst_rate_percent: input.gstRatePercent,
        ...(totals.incomplete ? { gst_split_incomplete: true } : {}),
      },
    })
    .select("id")
    .single();
  if (error) throw error;

  const documentId = (data as { id: string }).id;

  // An expense paid on the spot gets its payment recorded now, through the same canonical
  // payment path everything else uses — which is also what posts the settlement.
  if (input.kind === "expense" && input.paidImmediately) {
    const payment = await recordPayment({
      businessId,
      partyId: input.partyId,
      method: (input.paymentMethod as "cash" | "bank" | "upi" | "cheque" | "card_offline" | "other") ?? "bank",
      amount: totals.total,
      paymentDate: input.billDate,
      notes: input.notes?.trim() || null,
    });
    await allocatePayment({ businessId, paymentId: payment.id, documentId, amount: totals.total });
  }

  await publish({
    businessId,
    type: "document.issued",
    payload: { documentId, invoiceId: documentId, docType: "supplier_bill" },
    requiredModule: "gst",
  });

  return { documentId, total: totals.total };
}

/**
 * Records a payment against one or more bills or invoices.
 *
 * One payment, many allocations — which is how people actually pay: a single transfer
 * settling three bills. Each allocation posts its own settlement, so partially paying two
 * bills with one transfer produces two ledger entries, each traceable to its own bill.
 */
export async function recordBillPayment(
  businessId: string,
  input: {
    partyId: string;
    method: string;
    paymentDate: string;
    reference?: string | null;
    allocations: { documentId: string; amount: number }[];
  },
): Promise<{ paymentId: string; allocated: number }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const allocations = input.allocations.filter((a) => a.amount > 0);
  if (allocations.length === 0) {
    throw new Error("Enter an amount against at least one bill.");
  }
  const total = Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  if (total <= 0) throw new Error("The payment has to be greater than zero.");

  const payment = await recordPayment({
    businessId,
    partyId: input.partyId,
    method: (input.method as "cash" | "bank" | "upi" | "cheque" | "card_offline" | "other") ?? "bank",
    amount: total,
    reference: input.reference?.trim() || null,
    paymentDate: input.paymentDate,
  });

  // Allocated one at a time on purpose: `core.payment_allocations`' own trigger rejects
  // an allocation that would exceed the payment, and each allocation publishes its own
  // settlement event. A bulk insert would lose which one failed.
  for (const allocation of allocations) {
    await allocatePayment({
      businessId,
      paymentId: payment.id,
      documentId: allocation.documentId,
      amount: allocation.amount,
    });
  }

  return { paymentId: payment.id, allocated: total };
}
