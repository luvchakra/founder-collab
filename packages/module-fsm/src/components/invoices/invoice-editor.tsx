"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
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
  businessName,
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
  businessName: string;
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
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoice</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold break-words">{businessName}</h1>
            <Badge variant={STATUS_VARIANT[invoice.status] ?? "secondary"}>{STATUS_LABEL[invoice.status] ?? invoice.status}</Badge>
          </div>
          {invoice.number ? <p className="mt-1 text-xs text-muted-foreground">{invoice.number}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
          {canEdit && !isVoided ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add charge
            </Button>
          ) : null}
          {canVoid && !isVoided ? (
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => setVoidOpen(true)}>
              Void
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {lines.length === 0 ? (
        <EmptyState variant="inline" message="No charges added yet." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen (same fix as
              EstimateBuilder's own charge-line table). */}
          <ul className="divide-y md:hidden">
            {lines.map((line, i) => (
              <li key={line.id} className="flex min-w-0 flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{line.item_name}</p>
                    {line.item_sku ? <p className="text-xs text-muted-foreground">{line.item_sku}</p> : null}
                    {line.job_charge_type_name ? (
                      <p className="text-xs text-muted-foreground">{line.job_charge_type_name}</p>
                    ) : null}
                  </div>
                  {canEdit && !isVoided ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        aria-label="Edit charge"
                        onClick={() => setEditingLine(line)}
                      >
                        <Pencil className="size-4" />
                      </Button>
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
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Qty {line.quantity}</span>
                  <span>{inr.format(line.unit_price)} each</span>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={line.taxable}
                      disabled={!canEdit || isVoided || pending}
                      onCheckedChange={(checked) => run(() => updateLineAction(line.id, { taxable: checked === true }))}
                    />
                    Taxable
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold">
                    {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                  </p>
                  {canEdit && !isVoided ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={pending || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label="Move up"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || i === lines.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label="Move down"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
                  <TableCell className="max-w-64">
                    <p className="font-medium break-words">{line.item_name}</p>
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          aria-label="Edit charge"
                          onClick={() => setEditingLine(line)}
                        >
                          <Pencil className="size-4" />
                        </Button>
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
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {lines.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-border p-4 text-sm sm:items-end sm:p-6">
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
          <div className="rounded-2xl border border-border">
            <ul className="divide-y md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatDate(p.payment_date)}</span>
                    <span className="font-semibold">{inr.format(p.allocated_amount)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{METHOD_LABEL[p.method]}</span>
                    {p.reference ? <span className="break-all">{p.reference}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
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

      <Dialog open={editingLine !== null} onOpenChange={(open) => { if (!open) setEditingLine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit charge</DialogTitle>
          </DialogHeader>
          {editingLine ? (
            <form
              className="flex flex-col gap-4"
              action={async (form: FormData) => {
                const lineId = editingLine.id;
                const patch: UpdateChargeLineInput = {
                  quantity: Number(form.get("quantity") ?? 0),
                  unitPrice: Number(form.get("unit_price") ?? 0),
                  taxRate: Number(form.get("tax_rate") ?? 0),
                  taxable: form.get("taxable") === "on",
                  jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                };
                setError(null);
                setNotice(null);
                try {
                  await updateLineAction(lineId, patch);
                  setEditingLine(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Something went wrong.");
                }
              }}
            >
              <div>
                <p className="text-sm font-medium break-words">{editingLine.item_name}</p>
                {editingLine.item_sku ? <p className="text-xs text-muted-foreground">{editingLine.item_sku}</p> : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-qty">Quantity</Label>
                  <Input id="edit-qty" name="quantity" type="number" step="0.01" defaultValue={editingLine.quantity} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-price">Unit price</Label>
                  <Input id="edit-price" name="unit_price" type="number" step="0.01" defaultValue={editingLine.unit_price} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-tax-rate">Tax rate %</Label>
                  <Input id="edit-tax-rate" name="tax_rate" type="number" step="0.01" defaultValue={editingLine.tax_rate} required />
                </div>
                {jobChargeTypes.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-charge-type">Charge type</Label>
                    <NativeSelect id="edit-charge-type" name="job_charge_type_id" defaultValue={editingLine.job_charge_type_id ?? ""}>
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
                <Checkbox name="taxable" defaultChecked={editingLine.taxable} />
                Taxable
              </label>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditingLine(null)}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
