"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@cofounderai/core/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { inr, formatDate } from "@cofounderai/core/lib/format";
import type { Payment, PaymentMethod } from "@cofounderai/core/payments/types";
import type { AddChargeLineInput, ChargeableItemOption, Invoice, InvoiceLine, UpdateChargeLineInput } from "../../lib/invoices/types";
import type { JobChargeTypeOption } from "../../lib/job-charge-types/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  sent: "Sent",
  viewed: "Viewed by customer",
  partially_paid: "Partially paid",
  paid: "Paid",
  voided: "Voided",
};
const STATUS_VARIANT: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "secondary",
  issued: "outline",
  sent: "outline",
  viewed: "outline",
  partially_paid: "default",
  paid: "default",
  voided: "destructive",
};
const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  cheque: "Cheque",
  upi: "UPI",
  bank: "Bank transfer",
  card_offline: "Card (offline)",
  other: "Other",
};

/** Mirrors `EstimateBuilder` for the shared charge-line table (same reorder-by-buttons
 * choice, CLAUDE.md principle 2), plus invoice-only sections: balance, payment history,
 * and the send/record-payment/mark-paid/void actions PRD §1.4 lists. */
export function InvoiceEditor({
  invoice,
  lines,
  items,
  jobChargeTypes,
  payments,
  balanceAmount,
  paidAmount,
  canEdit,
  canRecordPayment,
  canVoid,
  addLineAction,
  updateLineAction,
  deleteLineAction,
  reorderAction,
  sendAction,
  recordPaymentAction,
  markPaidAction,
  markUnpaidAction,
  voidAction,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  items: ChargeableItemOption[];
  jobChargeTypes: JobChargeTypeOption[];
  payments: (Payment & { allocated_amount: number })[];
  balanceAmount: number;
  paidAmount: number;
  canEdit: boolean;
  canRecordPayment: boolean;
  canVoid: boolean;
  addLineAction: (input: AddChargeLineInput) => Promise<void>;
  updateLineAction: (lineId: string, patch: UpdateChargeLineInput) => Promise<void>;
  deleteLineAction: (lineId: string) => Promise<void>;
  reorderAction: (orderedLineIds: string[]) => Promise<void>;
  sendAction: () => Promise<void>;
  recordPaymentAction: (method: PaymentMethod, amount: number, reference: string, notes: string) => Promise<void>;
  markPaidAction: () => Promise<void>;
  markUnpaidAction: () => Promise<void>;
  voidAction: (reason: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [adHoc, setAdHoc] = useState(items.length === 0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<void>, onSuccessNotice?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await fn();
        if (onSuccessNotice) setNotice(onSuccessNotice);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const ordered = [...lines];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);
    run(() => reorderAction(ordered.map((l) => l.id)));
  };

  const isVoided = invoice.status === "voided";
  const isPaid = invoice.status === "paid";
  const canSend = canEdit && !isVoided && lines.length > 0;
  const canMarkPaid = canRecordPayment && !isVoided && !isPaid;
  const canMarkUnpaid = canRecordPayment && isPaid;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[invoice.status] ?? "secondary"}>{STATUS_LABEL[invoice.status] ?? invoice.status}</Badge>
          {invoice.number ? <span className="text-sm text-muted-foreground">{invoice.number}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canSend ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(sendAction, invoice.status === "draft" ? "Invoice sent." : "Invoice resent.")}
            >
              {invoice.status === "draft" ? "Send invoice" : "Resend invoice"}
            </Button>
          ) : null}
          {canRecordPayment && !isVoided ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setPaymentOpen(true)}>
              Record payment
            </Button>
          ) : null}
          {canMarkPaid ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(markPaidAction, "Marked paid.")}>
              Mark paid
            </Button>
          ) : null}
          {canMarkUnpaid ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => run(markUnpaidAction, "Marked unpaid.")}>
              Mark unpaid
            </Button>
          ) : null}
          {canVoid && !isVoided ? (
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => setVoidOpen(true)}>
              Void
            </Button>
          ) : null}
          {canEdit && !isVoided ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add charge
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No charges added yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Item</TableHead>
                <TableHead>Charge type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canEdit && !isVoided ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {canEdit && !isVoided ? (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={pending || i === 0}
                          onClick={() => move(i, -1)}
                          aria-label="Move up"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending || i === lines.length - 1}
                          onClick={() => move(i, 1)}
                          aria-label="Move down"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{line.item_name}</p>
                    {line.item_sku ? <p className="text-xs text-muted-foreground">{line.item_sku}</p> : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.job_charge_type_name ?? "-"}</TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">{inr.format(line.unit_price)}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={line.taxable}
                      disabled={!canEdit || isVoided || pending}
                      onCheckedChange={(checked) => run(() => updateLineAction(line.id, { taxable: checked === true }))}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                  </TableCell>
                  {canEdit && !isVoided ? (
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={pending} aria-label="Remove charge">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove &quot;{line.item_name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the charge line from the invoice and cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep charge</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => run(() => deleteLineAction(line.id))}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lines.length > 0 ? (
        <div className="flex flex-col items-end gap-1 text-sm">
          <p>Subtotal: {inr.format(invoice.subtotal)}</p>
          {invoice.cgst_amount > 0 ? <p>CGST: {inr.format(invoice.cgst_amount)}</p> : null}
          {invoice.sgst_amount > 0 ? <p>SGST: {inr.format(invoice.sgst_amount)}</p> : null}
          {invoice.igst_amount > 0 ? <p>IGST: {inr.format(invoice.igst_amount)}</p> : null}
          <p className="text-base font-semibold">Total: {inr.format(invoice.total_amount)}</p>
          <p>Paid: {inr.format(paidAmount)}</p>
          <p className="font-semibold">Balance due: {inr.format(balanceAmount)}</p>
        </div>
      ) : null}

      {payments.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Payment history</h3>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.payment_date)}</TableCell>
                    <TableCell>{METHOD_LABEL[p.method]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.reference ?? "-"}</TableCell>
                    <TableCell className="text-right">{inr.format(p.allocated_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a charge</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            action={async (form: FormData) => {
              const input: AddChargeLineInput = adHoc
                ? {
                    adHoc: {
                      name: String(form.get("adhoc_name") ?? ""),
                      unitPrice: Number(form.get("unit_price") ?? 0),
                      taxRate: Number(form.get("tax_rate") ?? 0),
                    },
                    quantity: Number(form.get("quantity") ?? 1),
                    taxable: form.get("taxable") === "on",
                    jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                  }
                : {
                    itemId: String(form.get("item_id") ?? ""),
                    quantity: Number(form.get("quantity") ?? 1),
                    taxable: form.get("taxable") === "on",
                    jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                  };
              setError(null);
              setNotice(null);
              try {
                await addLineAction(input);
                setAddOpen(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            }}
          >
            {items.length > 0 ? (
              <button type="button" className="self-end text-xs text-muted-foreground underline" onClick={() => setAdHoc((v) => !v)}>
                {adHoc ? "Pick an existing item instead" : "Ad-hoc charge instead"}
              </button>
            ) : null}

            {adHoc ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="adhoc_name" placeholder="Charge description" required className="sm:col-span-2" />
                <Input name="unit_price" type="number" step="0.01" placeholder="Price" required />
                <Input name="tax_rate" type="number" step="0.01" placeholder="Tax rate %" defaultValue={18} />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-item">Item</Label>
                <NativeSelect id="add-item" name="item_id" required>
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-qty">Quantity</Label>
                <Input id="add-qty" name="quantity" type="number" step="0.01" defaultValue={1} required />
              </div>
              {jobChargeTypes.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="add-charge-type">Charge type</Label>
                  <NativeSelect id="add-charge-type" name="job_charge_type_id">
                    <option value="">None</option>
                    {jobChargeTypes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="taxable" defaultChecked />
              Taxable
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Adding...">Add charge</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            action={async (form: FormData) => {
              setError(null);
              setNotice(null);
              try {
                await recordPaymentAction(
                  form.get("method") as PaymentMethod,
                  Number(form.get("amount") ?? 0),
                  String(form.get("reference") ?? ""),
                  String(form.get("notes") ?? ""),
                );
                setPaymentOpen(false);
                setNotice("Payment recorded.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            }}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-method">Method</Label>
                <NativeSelect id="pay-method" name="method" defaultValue="cash" required>
                  {Object.entries(METHOD_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pay-amount">Amount</Label>
                <Input id="pay-amount" name="amount" type="number" step="0.01" defaultValue={balanceAmount} required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-reference">Reference (optional)</Label>
              <Input id="pay-reference" name="reference" placeholder="Cheque no., UTR, ..." />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-notes">Notes (optional)</Label>
              <Textarea id="pay-notes" name="notes" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Recording...">Record payment</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Void this invoice?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This issues a credit note for the full amount and marks the invoice voided. This can't be undone.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="void-reason">Reason (optional)</Label>
            <Textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await voidAction(voidReason);
                  setVoidOpen(false);
                }, "Invoice voided.")
              }
            >
              {pending ? "Voiding..." : "Void invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
