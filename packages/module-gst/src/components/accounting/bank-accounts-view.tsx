"use client";

import { useState } from "react";
import Link from "next/link";
import { Landmark, Plus } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { BankAccountModal, type BankAccountActionState } from "./bank-account-modal";
import { ledgerAmount } from "./labels";
import type { AccountWithBalance } from "../../lib/accounting/queries";
import type { BankAccountWithPosition } from "../../lib/accounting/banking-queries";

/**
 * The accounts money actually moves through.
 *
 * The balance shown is the *statement* balance — opening balance plus every line the bank
 * has reported — deliberately labelled as such, because it is not the ledger's figure
 * until the two are reconciled, and presenting it as "the balance" is how people end up
 * trusting an unreconciled number.
 */
export function BankAccountsView({
  accounts,
  ledgerAccounts,
  basePath,
  canManage,
  createAction,
}: {
  accounts: BankAccountWithPosition[];
  ledgerAccounts: AccountWithBalance[];
  basePath: string;
  canManage: boolean;
  createAction: (prevState: BankAccountActionState, formData: FormData) => Promise<BankAccountActionState>;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add bank account
          </Button>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Landmark className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="max-w-md">
            <p className="font-medium">No bank accounts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the accounts your money moves through, then import a statement. Finance will
              suggest which ledger entry each line belongs to.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {accounts.map((account) => (
              <li key={account.id}>
                <Link href={`${basePath}/${account.id}`} className="flex flex-col gap-2 p-3 text-sm hover:bg-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{account.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {account.bank_name ?? "—"}
                        {account.account_number_last4 ? ` ····${account.account_number_last4}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{ledgerAmount.format(account.statementBalance)}</p>
                      <p className="text-xs text-muted-foreground">Per statement</p>
                    </div>
                  </div>
                  {account.unmatchedCount > 0 ? (
                    <Badge variant="warning" className="self-start">
                      {account.unmatchedCount} to match
                    </Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead className="w-32">Lines</TableHead>
                <TableHead className="w-36">To match</TableHead>
                <TableHead className="w-44 text-right">Balance per statement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id} className={account.is_active ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">
                    <Link href={`${basePath}/${account.id}`} className="hover:underline">
                      {account.name}
                    </Link>
                    {account.ledger_account_id ? null : (
                      <Badge variant="warning" className="ml-2">
                        Not linked to a ledger account
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {account.bank_name ?? "—"}
                    {account.account_number_last4 ? ` ····${account.account_number_last4}` : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{account.transactionCount}</TableCell>
                  <TableCell>
                    {account.unmatchedCount > 0 ? (
                      <Badge variant="warning">{account.unmatchedCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {ledgerAmount.format(account.statementBalance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showModal ? (
        <BankAccountModal
          ledgerAccounts={ledgerAccounts}
          action={createAction}
          onClose={() => setShowModal(false)}
        />
      ) : null}
    </div>
  );
}
