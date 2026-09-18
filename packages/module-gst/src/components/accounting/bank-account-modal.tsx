"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { AccountWithBalance } from "../../lib/accounting/queries";

export type BankAccountActionState = { error: string } | { success: true } | null;

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "current", label: "Current account" },
  { value: "savings", label: "Savings account" },
  { value: "cash", label: "Cash in hand" },
  { value: "credit_card", label: "Credit card" },
  { value: "wallet", label: "Wallet / UPI" },
  { value: "other", label: "Other" },
];

/**
 * Adding a bank account.
 *
 * Asks for the last four digits, never the full account number: those digits are all
 * anyone needs to tell two accounts apart, and storing the whole number would make this
 * table worth stealing for no benefit to the feature.
 */
export function BankAccountModal({
  ledgerAccounts,
  action,
  onClose,
}: {
  ledgerAccounts: AccountWithBalance[];
  action: (prevState: BankAccountActionState, formData: FormData) => Promise<BankAccountActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<BankAccountActionState, FormData>(action, null);
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
        aria-labelledby="bank-account-modal-title"
        className={`relative w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
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

        <h2 id="bank-account-modal-title" className="text-lg font-semibold">
          Add a bank account
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Where money actually sits. Link it to the ledger account its movements should post
          to — several bank accounts can share one.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input ref={firstFieldRef} id="name" name="name" required placeholder="HDFC current account" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank_name">Bank</Label>
              <Input id="bank_name" name="bank_name" placeholder="HDFC Bank" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account_number_last4">Last 4 digits</Label>
              <Input
                id="account_number_last4"
                name="account_number_last4"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account_type">Type</Label>
            <NativeSelect id="account_type" name="account_type" defaultValue="current">
              {ACCOUNT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ledger_account_id">Posts to</Label>
            <NativeSelect id="ledger_account_id" name="ledger_account_id" defaultValue="">
              <option value="">Choose a ledger account</option>
              {ledgerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_number} — {account.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Without this, statement lines can&apos;t be matched to ledger entries.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening_balance">Opening balance</Label>
              <Input id="opening_balance" name="opening_balance" defaultValue="0" inputMode="decimal" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opening_balance_date">As at</Label>
              <Input id="opening_balance_date" name="opening_balance_date" type="date" />
            </div>
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
            <SubmitButton pendingText="Adding...">Add account</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
