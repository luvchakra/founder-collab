"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import { createSupplierBill } from "@cofounderai/module-gst/lib/accounting/bill-mutations";
import type { BillKind } from "@cofounderai/module-gst/lib/accounting/bills";
import type { BillActionState } from "@cofounderai/module-gst/components/accounting/bill-modal";

/**
 * One action for bills and expenses, keyed on the `kind` the form submits — they are the
 * same document, and splitting this would duplicate the whole of the parsing below to
 * change one field.
 */
export async function createBillAction(
  businessId: string,
  _prevState: BillActionState,
  formData: FormData,
): Promise<BillActionState> {
  const kind = (String(formData.get("kind") ?? "bill") === "expense" ? "expense" : "bill") as BillKind;
  const taxableValue = Number(String(formData.get("taxable_value") ?? "").trim());
  const gstRatePercent = Number(String(formData.get("gst_rate_percent") ?? "0"));

  if (!Number.isFinite(taxableValue)) return { error: "The amount has to be a number." };
  if (!Number.isFinite(gstRatePercent)) return { error: "Choose a GST rate." };

  try {
    await createSupplierBill(businessId, {
      kind,
      partyId: String(formData.get("party_id") ?? ""),
      billNumber: String(formData.get("bill_number") ?? "").trim() || null,
      billDate: String(formData.get("bill_date") ?? ""),
      dueDate: String(formData.get("due_date") ?? "").trim() || null,
      taxableValue,
      gstRatePercent,
      valueAccountId: String(formData.get("value_account_id") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      paidImmediately: formData.get("paid_immediately") === "on",
      paymentMethod: String(formData.get("payment_method") ?? "bank"),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record this." };
  }

  const base = `${await businessPath(businessId)}/finance`;
  for (const path of ["bills", "expenses", "payables", "journal", "accounts"]) {
    revalidatePath(`${base}/${path}`);
  }
  return { success: true };
}
