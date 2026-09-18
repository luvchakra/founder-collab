"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { recordBillPayment } from "@cofounderai/module-gst/lib/accounting/bill-mutations";
import type { PayBillsActionState } from "@cofounderai/module-gst/components/accounting/pay-bills-modal";

/**
 * Records one payment across one supplier's bills.
 *
 * The form submits parallel `document_id` / `amount` fields, which is what a plain
 * multi-row form gives you. A row left at zero is a bill the person chose not to pay this
 * time, not an error.
 */
export async function payBillsAction(
  businessId: string,
  _prevState: PayBillsActionState,
  formData: FormData,
): Promise<PayBillsActionState> {
  const partyId = String(formData.get("party_id") ?? "");
  const paymentDate = String(formData.get("payment_date") ?? "");
  if (!partyId) return { error: "Couldn't tell which supplier this is for." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return { error: "Give the payment a date." };

  const documentIds = formData.getAll("document_id").map(String);
  const amounts = formData.getAll("amount").map(String);

  const allocations = documentIds
    .map((documentId, i) => ({ documentId, amount: Number(amounts[i] ?? 0) || 0 }))
    .filter((a) => a.documentId && a.amount > 0);

  if (allocations.some((a) => !Number.isFinite(a.amount))) {
    return { error: "Amounts have to be numbers." };
  }
  if (allocations.length === 0) {
    return { error: "Enter an amount against at least one bill." };
  }

  try {
    await recordBillPayment(businessId, {
      partyId,
      method: String(formData.get("method") ?? "bank"),
      paymentDate,
      reference: String(formData.get("reference") ?? ""),
      allocations,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record this payment." };
  }

  const base = `${await businessPath(businessId)}/finance`;
  for (const path of ["payables", "bills", "expenses", "journal", "accounts", "dashboard"]) {
    revalidatePath(`${base}/${path}`);
  }
  return { success: true };
}
