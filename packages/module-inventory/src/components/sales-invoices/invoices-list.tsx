"use client";

import { useState, useTransition } from "react";
import { FileText, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { GenerateInvoiceModal } from "./generate-invoice-modal";
import { InvoiceDetail } from "./invoice-detail";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import {
  PAYMENT_STATUS_LABEL,
  type CreditNote,
  type EligibleSalesOrder,
  type PaymentStatus,
  type SalesInvoice,
  type SalesInvoiceItem,
} from "../../lib/sales-invoices/types";

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "default" | "secondary" | "outline"> = {
  unpaid: "outline",
  partial: "secondary",
  paid: "default",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-invoices.tsx
 * `SalesInvoices` component. Gated on invoices.create for generating a new invoice,
 * invoices.edit for the payment-status selector, invoices.cancel for recording a
 * credit note -- matching the original's own three-permission split. */
export function InvoicesList({
  invoices,
  eligibleSalesOrders,
  canCreate,
  canEdit,
  canCancel,
  generateAction,
  updatePaymentStatusAction,
  createCreditNoteAction,
  fetchItems,
  fetchCreditNotes,
}: {
  invoices: SalesInvoice[];
  eligibleSalesOrders: EligibleSalesOrder[];
  canCreate: boolean;
  canEdit: boolean;
  canCancel: boolean;
  generateAction: (salesOrderId: string) => Promise<string>;
  updatePaymentStatusAction: (invoiceId: string, status: PaymentStatus) => Promise<void>;
  createCreditNoteAction: (invoiceId: string, isFull: boolean, subtotal: number | null, reason: string | null) => Promise<void>;
  fetchItems: (invoiceId: string) => Promise<SalesInvoiceItem[]>;
  fetchCreditNotes: (invoiceId: string) => Promise<CreditNote[]>;
}) {
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<SalesInvoice | null>(null);
  const [detailItems, setDetailItems] = useState<SalesInvoiceItem[]>([]);
  const [detailCreditNotes, setDetailCreditNotes] = useState<CreditNote[]>([]);
  const [, startTransition] = useTransition();

  const openDetail = async (invoice: SalesInvoice) => {
    setDetailTarget(invoice);
    const [items, creditNotes] = await Promise.all([fetchItems(invoice.id), fetchCreditNotes(invoice.id)]);
    setDetailItems(items);
    setDetailCreditNotes(creditNotes);
  };

  return (
    <div className="flex flex-col gap-4">
      {canCreate ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New invoice
          </Button>
        </div>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState icon={FileText} message="No invoices yet. Generate one from a confirmed sales order." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">{inv.invoice_number}</p>
                    <p className="font-medium break-words">{inv.customer_name}</p>
                  </div>
                  <Badge variant={PAYMENT_STATUS_VARIANT[inv.payment_status]} className="shrink-0">
                    {PAYMENT_STATUS_LABEL[inv.payment_status]}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>SO {inv.so_number}</span>
                  <span>{formatDate(inv.invoice_date)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold">{inr.format(inv.total_amount)}</span>
                  <Button variant="outline" size="sm" onClick={() => openDetail(inv)}>
                    View
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="font-medium">{inv.customer_name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{inv.so_number}</TableCell>
                  <TableCell>{formatDate(inv.invoice_date)}</TableCell>
                  <TableCell className="text-right">{inr.format(inv.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={PAYMENT_STATUS_VARIANT[inv.payment_status]}>{PAYMENT_STATUS_LABEL[inv.payment_status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openDetail(inv)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {generateOpen ? (
        <GenerateInvoiceModal
          eligibleSalesOrders={eligibleSalesOrders}
          onGenerate={async (soId) => {
            const invoiceId = await generateAction(soId);
            setGenerateOpen(false);
            const invoice = invoices.find((i) => i.id === invoiceId);
            if (invoice) await openDetail(invoice);
          }}
          onClose={() => setGenerateOpen(false)}
        />
      ) : null}

      {detailTarget
        ? (() => {
            const current = invoices.find((i) => i.id === detailTarget.id) ?? detailTarget;
            return (
              <InvoiceDetail
                invoice={current}
                items={detailItems}
                creditNotes={detailCreditNotes}
                canEdit={canEdit}
                canCancel={canCancel}
                onUpdatePaymentStatus={(status) =>
                  startTransition(async () => {
                    try {
                      await updatePaymentStatusAction(current.id, status);
                      toast.success("Payment status updated.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not update payment status.");
                    }
                  })
                }
                onCreateCreditNote={(isFull, subtotal, reason) =>
                  startTransition(async () => {
                    try {
                      await createCreditNoteAction(current.id, isFull, subtotal, reason);
                      await openDetail(current);
                      toast.success("Credit note issued.");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not create credit note.");
                    }
                  })
                }
                onClose={() => setDetailTarget(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
