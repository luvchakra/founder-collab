"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { ACCOUNT_TYPE_LABEL } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";
import type { AccountType } from "../../lib/accounting/types";

export type AccountActionState = { error: string } | { success: true } | null;

/**
 * Create or edit one account, in one modal.
 *
 * The two modes differ in more than which fields show: an account's *number* and *type*
 * place it in the statement and in every report built on it, so they are set once at
 * creation and never edited afterwards — renumbering an account that already carries
 * posted lines would silently move history between statement sections. Renaming is the
 * safe edit, and is the one businesses actually want (calling 1300 "Customer dues"
 * changes nothing about what posts there).
 */
export function AccountModal({
  account,
  accounts,
  createAction,
  updateAction,
  onClose,
}: {
  /** Null to create; the account being edited otherwise. */
  account: AccountWithBalance | null;
  /** Candidate parents, in tree order. */
  accounts: AccountWithBalance[];
  createAction: (prevState: AccountActionState, formData: FormData) => Promise<AccountActionState>;
  updateAction: (
    accountId: string,
    prevState: AccountActionState,
    formData: FormData,
  ) => Promise<AccountActionState>;
  onClose: () => void;
}) {
  const isEdit = account !== null;
  const action = isEdit ? updateAction.bind(null, account.id) : createAction;
  const [state, formAction] = useActionState<AccountActionState, FormData>(action, null);
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
        aria-labelledby="account-modal-title"
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

        <h2 id="account-modal-title" className="text-lg font-semibold">
          {isEdit ? `Edit ${account.account_number} — ${account.name}` : "Add an account"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEdit
            ? "An account's number and type place it in your statements, so those stay as they are. Rename it to match how your business talks about it."
            : "Numbering follows the usual blocks — 1000s assets, 2000s liabilities, 3000s equity, 4000s income, 5000s cost of sales, 6000s expenses."}
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          {isEdit ? null : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="account_number">Account number</Label>
                <Input
                  ref={firstFieldRef}
                  id="account_number"
                  name="account_number"
                  required
                  placeholder="6900"
                  inputMode="numeric"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="type">Type</Label>
                <NativeSelect id="type" name="type" defaultValue="expense">
                  {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((type) => (
                    <option key={type} value={type}>
                      {ACCOUNT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="parent_account_id">Sits under</Label>
                <NativeSelect id="parent_account_id" name="parent_account_id" defaultValue="">
                  <option value="">Top level</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_number} — {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="opening_balance">Opening balance</Label>
                <Input id="opening_balance" name="opening_balance" defaultValue="0" inputMode="decimal" />
                <p className="text-xs text-muted-foreground">
                  What this account already held before you started posting here. Leave at 0 if
                  nothing.
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              ref={isEdit ? firstFieldRef : undefined}
              id="name"
              name="name"
              required
              defaultValue={account?.name ?? ""}
              placeholder="Bank charges"
            />
          </div>

          {isEdit ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="subtype">Sub-type (optional)</Label>
                <Input id="subtype" name="subtype" defaultValue={account.subtype ?? ""} />
              </div>

              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  id="is_active"
                  name="is_active"
                  defaultChecked={account.is_active}
                  disabled={account.is_system}
                  className="mt-0.5"
                />
                <span>
                  In use
                  <span className="block text-xs text-muted-foreground">
                    {account.is_system
                      ? "Automatic postings resolve to this account, so it can be renamed but not switched off."
                      : "Switch off an account you no longer post to. Its history stays where it is."}
                  </span>
                </span>
              </label>
            </>
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
            <SubmitButton pendingText="Saving...">{isEdit ? "Save changes" : "Add account"}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
