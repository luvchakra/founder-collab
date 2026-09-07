"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  generateSalesInvoice,
  updateInvoicePaymentStatus,
  createCreditNote,
} from "@cofounderai/module-inventory/lib/sales-invoices/mutations";
import { listSalesInvoiceItems, listCreditNotes } from "@cofounderai/module-inventory/lib/sales-invoices/queries";
import type { CreditNote, PaymentStatus, SalesInvoiceItem } from "@cofounderai/module-inventory/lib/sales-invoices/types";

function invoicesPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/inventory/sales-invoices`;
}

export async function generateSalesInvoiceAction(businessId: string, salesOrderId: string): Promise<string> {
  await requirePermission(businessId, "invoices.create");
  const invoiceId = await generateSalesInvoice(salesOrderId);
  revalidatePath(invoicesPath(businessId));
  return invoiceId;
}

export async function updateInvoicePaymentStatusAction(
  businessId: string,
  invoiceId: string,
  status: PaymentStatus,
): Promise<void> {
  await requirePermission(businessId, "invoices.edit");
  await updateInvoicePaymentStatus(invoiceId, status);
  revalidatePath(invoicesPath(businessId));
}

export async function createCreditNoteAction(
  businessId: string,
  invoiceId: string,
  isFull: boolean,
  subtotal: number | null,
  reason: string | null,
): Promise<void> {
  await requirePermission(businessId, "invoices.cancel");
  await createCreditNote(invoiceId, { isFull, subtotal, reason });
  revalidatePath(invoicesPath(businessId));
}

export async function fetchSalesInvoiceItemsAction(invoiceId: string): Promise<SalesInvoiceItem[]> {
  return listSalesInvoiceItems(invoiceId);
}

export async function fetchCreditNotesAction(invoiceId: string): Promise<CreditNote[]> {
  return listCreditNotes(invoiceId);
}
