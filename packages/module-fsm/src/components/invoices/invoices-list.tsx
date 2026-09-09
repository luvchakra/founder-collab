"use client";

import { useState } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import type { InvoiceListItem, InvoiceStatus } from "../../lib/invoices/types";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  voided: "Voided",
};
const STATUS_VARIANT: Record<InvoiceStatus, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "secondary",
  issued: "outline",
  sent: "outline",
  viewed: "outline",
  partially_paid: "default",
  paid: "default",
  voided: "destructive",
};

/** `/fsm/invoices`'s own list -- "Unpaid" (issued/sent/viewed/partially_paid, PRD §1.4's
 * own working set) vs "All" tabs, same table-only shape as `OpportunitiesList` (no board:
 * an invoice doesn't move through discrete columns the way a job or opportunity does). */
export function InvoicesList({ invoices, businessId }: { invoices: InvoiceListItem[]; businessId: string }) {
  const [tab, setTab] = useState<"unpaid" | "all">("unpaid");
  const invoiceHref = (id: string) => `/dashboard/businesses/${businessId}/fsm/invoices/${id}`;

  const shown = tab === "unpaid" ? invoices.filter((i) => i.status !== "paid" && i.status !== "voided" && i.status !== "draft") : invoices;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 rounded-lg border border-border p-1">
        <Button variant={tab === "unpaid" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("unpaid")}>
          Unpaid
        </Button>
        <Button variant={tab === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("all")}>
          All
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState variant="inline" message={tab === "unpaid" ? "No unpaid invoices." : "No invoices yet."} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Job #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((inv) => (
                <TableRow key={inv.id} className="cursor-pointer">
                  <TableCell>
                    <a href={invoiceHref(inv.id)} className="hover:underline">
                      {inv.number ?? "Draft"}
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{inv.job_number ?? "-"}</TableCell>
                  <TableCell>{inv.party_name}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[inv.status]}>{STATUS_LABEL[inv.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{inr.format(inv.total_amount)}</TableCell>
                  <TableCell className="text-right font-medium">{inr.format(inv.balance_amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(inv.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
