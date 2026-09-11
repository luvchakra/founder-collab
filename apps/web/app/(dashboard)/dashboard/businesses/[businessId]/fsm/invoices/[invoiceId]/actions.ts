"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import type { PaymentMethod } from "@cofounderai/core/payments/types";
import { addChargeLine, deleteChargeLine, reorderChargeLines, updateChargeLine } from "@cofounderai/module-fsm/lib/estimates/mutations";
import type { AddChargeLineInput, UpdateChargeLineInput } from "@cofounderai/module-fsm/lib/estimates/types";
import { getInvoice } from "@cofounderai/module-fsm/lib/invoices/queries";
import {
  markInvoicePaid,
  markInvoiceUnpaid,
  recordManualPayment,
  sendInvoice,
  voidInvoiceViaCreditNote,
} from "@cofounderai/module-fsm/lib/invoices/mutations";
import {
  cancelDocumentEinvoice,
  cancelDocumentEwayBill,
  generateDocumentEinvoice,
  generateDocumentEwayBill,
} from "@cofounderai/module-gst/contract/index";
import type { ContractResult } from "@cofounderai/module-gst/contract/types";

function detailPath(businessId: string, invoiceId: string) {
  return `/dashboard/businesses/${businessId}/fsm/invoices/${invoiceId}`;
}

export async function addInvoiceChargeLineAction(businessId: string, invoiceId: string, input: AddChargeLineInput): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await addChargeLine(businessId, invoiceId, input);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function updateInvoiceChargeLineAction(businessId: string, invoiceId: string, lineId: string, patch: UpdateChargeLineInput): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await updateChargeLine(businessId, invoiceId, lineId, patch);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function deleteInvoiceChargeLineAction(businessId: string, invoiceId: string, lineId: string): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await deleteChargeLine(businessId, invoiceId, lineId);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function reorderInvoiceChargeLinesAction(businessId: string, invoiceId: string, orderedLineIds: string[]): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await reorderChargeLines(invoiceId, orderedLineIds);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function sendInvoiceAction(businessId: string, invoiceId: string): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  const invoice = await getInvoice(businessId, invoiceId);
  if (!invoice) throw new Error("Invoice not found.");
  await sendInvoice(businessId, invoice.job_id, invoiceId);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function recordInvoicePaymentAction(
  businessId: string,
  invoiceId: string,
  method: PaymentMethod,
  amount: number,
  reference: string,
  notes: string,
): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await recordManualPayment(businessId, invoiceId, method, amount, reference || undefined, notes || undefined);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function markInvoicePaidAction(businessId: string, invoiceId: string): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await markInvoicePaid(businessId, invoiceId);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function markInvoiceUnpaidAction(businessId: string, invoiceId: string): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await markInvoiceUnpaid(businessId, invoiceId);
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function voidInvoiceAction(businessId: string, invoiceId: string, reason: string): Promise<void> {
  await requirePermission(businessId, "invoices.cancel");
  await voidInvoiceViaCreditNote(businessId, invoiceId, reason || undefined);
  revalidatePath(detailPath(businessId, invoiceId));
}

function unwrap<T>(result: ContractResult<T>): void {
  if (!result.ok) throw new Error(result.error === "MODULE_NOT_LICENSED" ? "Compliance module is not licensed for this business." : result.error);
}

export async function generateInvoiceEinvoiceAction(businessId: string, invoiceId: string): Promise<void> {
  await requirePermission(businessId, "gst.generate");
  unwrap(await generateDocumentEinvoice(businessId, invoiceId));
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function cancelInvoiceEinvoiceAction(businessId: string, invoiceId: string, reason?: string): Promise<void> {
  await requirePermission(businessId, "gst.generate");
  unwrap(await cancelDocumentEinvoice(businessId, invoiceId, reason));
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function generateInvoiceEwayBillAction(businessId: string, invoiceId: string): Promise<void> {
  await requirePermission(businessId, "gst.generate");
  unwrap(await generateDocumentEwayBill(businessId, invoiceId));
  revalidatePath(detailPath(businessId, invoiceId));
}

export async function cancelInvoiceEwayBillAction(businessId: string, invoiceId: string, reason?: string): Promise<void> {
  await requirePermission(businessId, "gst.generate");
  unwrap(await cancelDocumentEwayBill(businessId, invoiceId, reason));
  revalidatePath(detailPath(businessId, invoiceId));
}
