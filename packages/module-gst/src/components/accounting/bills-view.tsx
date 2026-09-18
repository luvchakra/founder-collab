"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Receipt } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { BillModal, type BillActionState, type SupplierOption } from "./bill-modal";
import { ledgerAmount } from "./labels";
import type { PaymentStatus } from "../../lib/accounting/aging";
import type { BillKind } from "../../lib/accounting/bills";
import type { BillRow } from "../../lib/accounting/bill-queries";
import type { AccountWithBalance } from "../../lib/accounting/queries";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  overpaid: "Overpaid",
};

export function BillsView({
  kind,
  bills,
  suppliers,
  accounts,
  canManage,
  createAction,
}: {
  kind: BillKind;
  bills: BillRow[];
  suppliers: SupplierOption[];
  accounts: AccountWithBalance[];
  canManage: boolean;
  createAction: (prevState: BillActionState, formData: FormData) => Promise<BillActionState>;
}) {
  const [showModal, setShowModal] = useState(false);
  const noun = kind === "expense" ? "expense" : "bill";

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New {noun}
          </Button>
        </div>
      ) : null}

      {bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          message={
            kind === "expense"
              ? "No expenses recorded yet. Rent, software, travel — anything you paid for that was never stock."
              : "No supplier bills yet. Record what a supplier has invoiced you and it posts to your ledger and appears in Payables."
          }
        />
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {bills.map((bill) => (
              <li key={bill.id} className="flex flex-col gap-1.5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{bill.number ?? "—"}</p>
                    <p className="text-xs text-muted-foreground break-words">{bill.partyName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{ledgerAmount.format(bill.total)}</p>
                    {bill.outstanding > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {ledgerAmount.format(bill.outstanding)} left
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={bill.status} label={STATUS_LABEL[bill.status]} />
                  <span>{formatDate(bill.docDate)}</span>
                  {bill.gstSplitIncomplete ? (
                    <Badge variant="warning">GST not split</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Number</TableHead>
                <TableHead>{kind === "expense" ? "Paid to" : "Supplier"}</TableHead>
                <TableHead className="w-32">Date</TableHead>
                <TableHead className="w-32">Due</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36 text-right">Total</TableHead>
                <TableHead className="w-36 text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="font-medium tabular-nums">
                    {bill.number ?? "—"}
                    {/* No input credit is claimable on this, which is worth seeing in the
                        list rather than only on the GST ledger. */}
                    {bill.gstSplitIncomplete ? (
                      <span title="GST couldn't be split — no input credit claimable">
                        <AlertTriangle
                          className="ml-1.5 inline size-3.5 text-warning-subtle"
                          aria-label="GST couldn't be split"
                        />
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{bill.partyName}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(bill.docDate)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {bill.dueDate ? formatDate(bill.dueDate) : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={bill.status} label={STATUS_LABEL[bill.status]} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(bill.total)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {bill.outstanding > 0 ? ledgerAmount.format(bill.outstanding) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showModal ? (
        <BillModal
          kind={kind}
          suppliers={suppliers}
          accounts={accounts}
          action={createAction}
          onClose={() => setShowModal(false)}
        />
      ) : null}
    </div>
  );
}
