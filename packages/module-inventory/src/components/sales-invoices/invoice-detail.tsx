"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import {
  PAYMENT_STATUS_LABEL,
  type CreditNote,
  type PaymentStatus,
  type SalesInvoice,
  type SalesInvoiceItem,
} from "../../lib/sales-invoices/types";

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, "default" | "secondary" | "outline"> = {
  unpaid: "outline",
  partial: "secondary",
  paid: "default",
};

function inr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Ported from stockpilot-ai-ops's sales-invoices.tsx detail dialog: line items, totals,
 * existing credit notes, an inline "record credit note" form, and the payment-status
 * selector. Print/CSV-export/e-way-bill/e-invoice panels aren't ported (separate,
 * not-yet-built generation-history features -- see docs/PORT-PROVENANCE.md). */
export function InvoiceDetail({
  invoice,
  items,
  creditNotes,
  canEdit,
  canCancel,
  onUpdatePaymentStatus,
  onCreateCreditNote,
  onClose,
}: {
  invoice: SalesInvoice;
  items: SalesInvoiceItem[];
  creditNotes: CreditNote[];
  canEdit: boolean;
  canCancel: boolean;
  onUpdatePaymentStatus: (status: PaymentStatus) => void;
  onCreateCreditNote: (isFull: boolean, subtotal: number | null, reason: string | null) => void;
  onClose: () => void;
}) {
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [creditKind, setCreditKind] = useState<"full" | "partial">("full");
  const [creditSubtotal, setCreditSubtotal] = useState("0");
  const [creditReason, setCreditReason] = useState("");

  const creditedSubtotal = creditNotes.reduce((sum, cn) => sum + cn.subtotal, 0);
  const creditedTotal = creditNotes.reduce((sum, cn) => sum + cn.total_amount, 0);
  const remainingSubtotal = invoice.subtotal - creditedSubtotal;
  const netPayable = invoice.total_amount - creditedTotal;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{invoice.invoice_number}</h2>
          <Badge variant={PAYMENT_STATUS_VARIANT[invoice.payment_status]}>{PAYMENT_STATUS_LABEL[invoice.payment_status]}</Badge>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Buyer</p>
            <p className="font-medium">{invoice.customer_name}</p>
            <p className="font-mono text-xs text-muted-foreground">{invoice.customer_gstin ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Invoice date</p>
            <p className="font-medium">{formatDate(invoice.invoice_date)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sales order</p>
            <p className="font-mono text-xs font-medium">{invoice.so_number}</p>
          </div>
          {invoice.billing_address ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Billing address</p>
              <p className="font-medium">{invoice.billing_address}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>HSN/SAC</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">GST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.item_name} <span className="text-muted-foreground">({item.item_sku ?? "no SKU"})</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.hsn_code ?? "—"}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{inr(item.unit_price)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{item.tax_rate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{inr(invoice.subtotal)}</span>
          </div>
          {invoice.igst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>IGST</span>
              <span>{inr(invoice.igst_amount)}</span>
            </div>
          ) : null}
          {invoice.cgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>CGST</span>
              <span>{inr(invoice.cgst_amount)}</span>
            </div>
          ) : null}
          {invoice.sgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>SGST</span>
              <span>{inr(invoice.sgst_amount)}</span>
            </div>
          ) : null}
          {invoice.shipping_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{inr(invoice.shipping_amount)}</span>
            </div>
          ) : null}
          {invoice.discount_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{inr(invoice.discount_amount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span>{inr(invoice.total_amount)}</span>
          </div>
        </div>

        {creditNotes.length > 0 ? (
          <div className="mt-5 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Credit notes</p>
            <div className="space-y-2">
              {creditNotes.map((cn) => (
                <div key={cn.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-mono text-xs font-medium">{cn.credit_note_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(cn.credit_note_date)}
                      {cn.reason ? ` · ${cn.reason}` : ""}
                    </p>
                  </div>
                  <span className="font-medium">-{inr(cn.total_amount)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-base font-semibold">
              <span>Net payable</span>
              <span>{inr(netPayable)}</span>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {canEdit ? (
            <NativeSelect
              className="w-40"
              value={invoice.payment_status}
              onChange={(e) => onUpdatePaymentStatus(e.target.value as PaymentStatus)}
            >
              <option value="unpaid">Unpaid</option>
              <option value="partial">Partially paid</option>
              <option value="paid">Paid</option>
            </NativeSelect>
          ) : (
            <Badge variant={PAYMENT_STATUS_VARIANT[invoice.payment_status]}>{PAYMENT_STATUS_LABEL[invoice.payment_status]}</Badge>
          )}
          {remainingSubtotal > 0 && canCancel ? (
            <Button variant="outline" onClick={() => setCreditNoteOpen((v) => !v)}>
              Record credit note
            </Button>
          ) : null}
        </div>

        {creditNoteOpen ? (
          <div className="mt-4 space-y-4 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cn-kind">Type</Label>
              <NativeSelect id="cn-kind" value={creditKind} onChange={(e) => setCreditKind(e.target.value as "full" | "partial")}>
                <option value="full">Full — remaining {inr(remainingSubtotal)} + tax</option>
                <option value="partial">Partial</option>
              </NativeSelect>
            </div>
            {creditKind === "partial" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cn-subtotal">Taxable value</Label>
                <Input
                  id="cn-subtotal"
                  type="number"
                  min={0.01}
                  max={remainingSubtotal}
                  step="0.01"
                  value={creditSubtotal}
                  onChange={(e) => setCreditSubtotal(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Up to {inr(remainingSubtotal)} remaining. Tax is credited proportionally to the invoice&apos;s own rate.
                </p>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cn-reason">Reason (optional)</Label>
              <Input id="cn-reason" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="e.g. Damaged goods returned" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreditNoteOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onCreateCreditNote(creditKind === "full", creditKind === "partial" ? Number(creditSubtotal) : null, creditReason || null);
                  setCreditNoteOpen(false);
                  setCreditKind("full");
                  setCreditSubtotal("0");
                  setCreditReason("");
                }}
              >
                Record credit note
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
