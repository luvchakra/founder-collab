"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { GST_RATES, type BillKind } from "../../lib/accounting/bills";
import { ledgerAmount } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";

export type BillActionState = { error: string } | { success: true } | null;

export interface SupplierOption {
  id: string;
  name: string;
  hasGstin: boolean;
}

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card_offline", label: "Card" },
  { value: "other", label: "Other" },
];

/**
 * Entering a bill or an expense.
 *
 * One form for both, because they are one document: an expense is a bill for something
 * that was never stock. What differs is which accounts are offered and whether it was
 * paid on the spot.
 *
 * The total is shown as it is typed. A bill is a number someone is reading off a piece of
 * paper, and being able to see the two match before saving is the whole check.
 */
export function BillModal({
  kind,
  suppliers,
  accounts,
  action,
  onClose,
}: {
  kind: BillKind;
  suppliers: SupplierOption[];
  accounts: AccountWithBalance[];
  action: (prevState: BillActionState, formData: FormData) => Promise<BillActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<BillActionState, FormData>(action, null);
  const [taxableValue, setTaxableValue] = useState("");
  const [rate, setRate] = useState(kind === "expense" ? "18" : "18");
  const [supplierId, setSupplierId] = useState("");
  const [paidNow, setPaidNow] = useState(kind === "expense");
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    firstFieldRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  const value = Number(taxableValue) || 0;
  const tax = Math.round(value * (Number(rate) || 0)) / 100;
  const total = Math.round((value + tax) * 100) / 100;
  const supplier = suppliers.find((s) => s.id === supplierId);

  // Only accounts a purchase can sensibly land on. Offering income accounts here is how
  // a bill ends up filed as revenue.
  const valueAccounts = accounts.filter(
    (a) =>
      a.is_active &&
      (kind === "expense"
        ? a.type === "expense" || a.type === "cogs"
        : a.type === "asset" || a.type === "expense" || a.type === "cogs"),
  );

  const noun = kind === "expense" ? "expense" : "bill";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-modal-title"
        className={`relative max-h-full w-full max-w-lg overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="bill-modal-title" className="text-lg font-semibold">
          {kind === "expense" ? "Record an expense" : "Record a supplier bill"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {kind === "expense"
            ? "Something you paid for that was never stock — rent, software, travel."
            : "What a supplier has invoiced you, and when it's due."}
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="kind" value={kind} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="party_id">{kind === "expense" ? "Paid to" : "Supplier"}</Label>
            <NativeSelect
              ref={firstFieldRef}
              id="party_id"
              name="party_id"
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
            {/* Place of supply decides CGST/SGST against IGST, and without a GSTIN there
                is no state to decide it from — said here rather than after saving. */}
            {supplier && !supplier.hasGstin ? (
              <p className="flex items-start gap-1.5 text-xs text-warning-subtle">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                No GSTIN on file for this supplier, so GST can&apos;t be split and no input
                credit will be claimable.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill_number">{kind === "expense" ? "Reference" : "Their bill number"}</Label>
              <Input id="bill_number" name="bill_number" placeholder="Leave blank to number it for you" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bill_date">Date</Label>
              <Input
                id="bill_date"
                name="bill_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="value_account_id">
              {kind === "expense" ? "Expense account" : "Goes to"}
            </Label>
            <NativeSelect id="value_account_id" name="value_account_id" required defaultValue="">
              <option value="">Choose an account…</option>
              {valueAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number} — {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxable_value">Amount before GST</Label>
              <Input
                id="taxable_value"
                name="taxable_value"
                inputMode="decimal"
                required
                value={taxableValue}
                onChange={(e) => setTaxableValue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gst_rate_percent">GST rate</Label>
              <NativeSelect
                id="gst_rate_percent"
                name="gst_rate_percent"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              >
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {kind === "expense" ? (
            <>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  name="paid_immediately"
                  checked={paidNow}
                  onCheckedChange={(checked) => setPaidNow(checked === true)}
                  className="mt-0.5"
                />
                <span>
                  Already paid
                  <span className="block text-xs text-muted-foreground">
                    Leave this off if it&apos;s on terms — it&apos;ll show in Payables until you pay it.
                  </span>
                </span>
              </label>
              {paidNow ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="payment_method">Paid by</Label>
                  <NativeSelect id="payment_method" name="payment_method" defaultValue="bank">
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </>
          ) : null}

          {!(kind === "expense" && paidNow) ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due_date">Due</Label>
              <Input id="due_date" name="due_date" type="date" />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          {/* The number they are reading off the paper, so the two can be compared before
              this is saved. */}
          <div className="flex items-baseline justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">
              {ledgerAmount.format(value)} + {ledgerAmount.format(tax)} GST
            </span>
            <span className="font-semibold tabular-nums">{ledgerAmount.format(total)}</span>
          </div>

          {state && "error" in state ? (
            <p role="alert" className="text-sm text-destructive-subtle">
              {state.error}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Saving..." disabled={total <= 0 || !supplierId}>
              Record {noun}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
