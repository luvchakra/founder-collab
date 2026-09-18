"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDate } from "@cofounderai/core/lib/format";
import { ledgerAmount } from "./labels";
import type { OpenPayable } from "../../lib/accounting/payables";

export type PayBillsActionState = { error: string } | { success: true } | null;

const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "card_offline", label: "Card" },
  { value: "other", label: "Other" },
];

/**
 * Paying one supplier, against one or more of their bills.
 *
 * Scoped to a single supplier because that is how a payment actually happens — one
 * transfer to one account — and because `core.payments` carries exactly one `party_id`.
 * Letting someone tick bills from three suppliers would build a payment that cannot be
 * recorded.
 *
 * Each bill's own amount is editable and pre-filled with what is outstanding: settling
 * three bills in full is the common case and should need no typing, but paying part of
 * one is normal too.
 */
export function PayBillsModal({
  supplierName,
  bills,
  action,
  onClose,
}: {
  supplierName: string;
  bills: OpenPayable[];
  action: (prevState: PayBillsActionState, formData: FormData) => Promise<PayBillsActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<PayBillsActionState, FormData>(action, null);
  const [amounts, setAmounts] = useState<Record<string, string>>(
    () => Object.fromEntries(bills.map((b) => [b.id, String(b.outstanding)])),
  );
  const firstFieldRef = useRef<HTMLInputElement>(null);
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

  const total = Math.round(
    bills.reduce((sum, b) => sum + (Number(amounts[b.id]) || 0), 0) * 100,
  ) / 100;

  // Paying more than a bill owes is almost always a typo here, and the allocation trigger
  // would reject it anyway — better to say so before submitting.
  const overAllocated = bills.filter((b) => (Number(amounts[b.id]) || 0) > b.outstanding);

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
        aria-labelledby="pay-bills-title"
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

        <h2 id="pay-bills-title" className="text-lg font-semibold">
          Pay {supplierName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One payment, across as many of their bills as you like.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="party_id" value={bills[0]?.partyId ?? ""} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment_date">Paid on</Label>
              <Input
                ref={firstFieldRef}
                id="payment_date"
                name="payment_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="method">Paid by</Label>
              <NativeSelect id="method" name="method" defaultValue="bank">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reference">Reference</Label>
            <Input id="reference" name="reference" placeholder="UTR or cheque number" />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Against</Label>
            {bills.map((bill) => (
              <div key={bill.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
                <input type="hidden" name="document_id" value={bill.id} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{bill.number ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {ledgerAmount.format(bill.outstanding)} outstanding
                    {bill.dueDate ? ` · due ${formatDate(bill.dueDate)}` : ""}
                  </p>
                </div>
                <Input
                  name="amount"
                  aria-label={`Amount against ${bill.number ?? "this bill"}`}
                  inputMode="decimal"
                  className="w-32 text-right"
                  value={amounts[bill.id] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [bill.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="flex items-baseline justify-between rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">Total payment</span>
            <span className="font-semibold tabular-nums">{ledgerAmount.format(total)}</span>
          </div>

          {overAllocated.length > 0 ? (
            <p className="text-sm text-warning-subtle">
              {overAllocated.length === 1
                ? `That's more than ${overAllocated[0]!.number ?? "the bill"} owes.`
                : `${overAllocated.length} of these are more than the bill owes.`}
            </p>
          ) : null}

          {state && "error" in state ? (
            <p role="alert" className="text-sm text-destructive-subtle">
              {state.error}
            </p>
          ) : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Recording..." disabled={total <= 0 || overAllocated.length > 0}>
              Record payment
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
