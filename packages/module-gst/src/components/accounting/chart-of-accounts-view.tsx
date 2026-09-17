"use client";

import { useState } from "react";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { AccountModal, type AccountActionState } from "./account-modal";
import { ACCOUNT_ROLE_LABEL, ACCOUNT_TYPE_LABEL, ledgerAmount } from "./labels";
import type { AccountTypeTotal, AccountWithBalance } from "../../lib/accounting/queries";
import type { AccountRoleKey, AccountType } from "../../lib/accounting/types";

/**
 * The Chart of Accounts: the business's own ledger structure, with what each account
 * currently holds.
 *
 * Reading comes first — this is the page someone opens to understand where money is
 * recorded, not a data-entry screen — so the hierarchy is the layout: section totals
 * across the top, then the tree itself with children indented under their parent, and
 * editing tucked into a row action rather than competing with it. Below `md` the table
 * becomes one card per account (CLAUDE.md rule 12): six columns of numbers do not
 * survive a phone width, and a horizontally-scrolling ledger is unreadable.
 */
export function ChartOfAccountsView({
  accounts,
  totals,
  rolesByAccount,
  canEdit,
  provisionAction,
  createAction,
  updateAction,
}: {
  accounts: AccountWithBalance[];
  totals: AccountTypeTotal[];
  /** Account id -> the posting roles that resolve to it. */
  rolesByAccount: Record<string, AccountRoleKey[]>;
  canEdit: boolean;
  provisionAction: () => Promise<void>;
  createAction: (prevState: AccountActionState, formData: FormData) => Promise<AccountActionState>;
  updateAction: (
    accountId: string,
    prevState: AccountActionState,
    formData: FormData,
  ) => Promise<AccountActionState>;
}) {
  const [modal, setModal] = useState<{ account: AccountWithBalance | null } | null>(null);
  const totalByType = new Map(totals.map((t) => [t.type, t.total]));

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border p-12 text-center">
        <BookOpen className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="max-w-md">
          <p className="font-medium">No chart of accounts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with the standard set — assets, liabilities, equity, income, cost of sales and
            expenses — and rename or add to it as you go. Your invoices, bills and payments post
            here automatically once it exists.
          </p>
        </div>
        {canEdit ? (
          <form action={provisionAction}>
            <SubmitButton pendingText="Setting up...">Set up chart of accounts</SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an owner or admin to set this up.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((type) => (
          <div key={type} className="bg-card px-4 py-3">
            <dt className="text-xs text-balance text-muted-foreground">{ACCOUNT_TYPE_LABEL[type]}</dt>
            <dd className="mt-1 truncate text-base font-semibold tracking-tight tabular-nums">
              {ledgerAmount.format(totalByType.get(type) ?? 0)}
            </dd>
          </div>
        ))}
      </dl>

      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" onClick={() => setModal({ account: null })}>
            <Plus className="size-4" aria-hidden="true" />
            Add account
          </Button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border">
        {/* Mobile: one card per account. */}
        <ul className="divide-y md:hidden">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-col gap-2 p-3 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    <span className="text-muted-foreground tabular-nums">{account.account_number}</span>{" "}
                    {account.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[account.type]}</p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {ledgerAmount.format(account.balance)}
                </p>
              </div>

              <AccountTags account={account} roles={rolesByAccount[account.id]} />

              {canEdit ? (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setModal({ account })}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Number</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-36">Type</TableHead>
              <TableHead>Used for</TableHead>
              <TableHead className="w-40 text-right">Balance</TableHead>
              {canEdit ? <TableHead className="w-20 text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id} className={account.is_active ? undefined : "opacity-60"}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {account.account_number}
                </TableCell>
                <TableCell>
                  {/* Indent rather than a nested table: the tree is at most a couple of
                      levels deep, and indentation keeps every balance in one column. */}
                  <span
                    className={account.depth === 0 ? "font-semibold" : undefined}
                    style={{ paddingLeft: `${account.depth * 1.25}rem` }}
                  >
                    {account.name}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{ACCOUNT_TYPE_LABEL[account.type]}</TableCell>
                <TableCell>
                  <AccountTags account={account} roles={rolesByAccount[account.id]} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {ledgerAmount.format(account.balance)}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setModal({ account })}
                      aria-label={`Edit ${account.name}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {modal ? (
        <AccountModal
          account={modal.account}
          accounts={accounts}
          createAction={createAction}
          updateAction={updateAction}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

/** Why an account matters beyond its name: which automatic postings land on it, and
 * whether it's still in use. Nothing at all for an ordinary active account — a badge on
 * every row would say nothing. */
function AccountTags({
  account,
  roles,
}: {
  account: AccountWithBalance;
  roles: AccountRoleKey[] | undefined;
}) {
  if ((!roles || roles.length === 0) && account.is_active) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {(roles ?? []).map((role) => (
        <Badge key={role} variant="secondary" className="font-normal">
          {ACCOUNT_ROLE_LABEL[role]}
        </Badge>
      ))}
      {account.is_active ? null : <Badge variant="outline">Not in use</Badge>}
    </div>
  );
}
