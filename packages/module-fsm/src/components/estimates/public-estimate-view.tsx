"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import type { PublicEstimateView } from "../../lib/estimates/types";

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting your response",
  viewed: "Awaiting your response",
  approved: "Approved",
  declined: "Declined",
};

/** The `/p/e/[token]` page's content -- no auth, tokenised, read-only except the
 * approve/decline buttons (PRD §2: "public estimate page, ... approve/decline by
 * customer"). Both actions take the raw token, never a business/document id, since this
 * page has no session to authorize against. */
export function PublicEstimateView({
  view,
  approveAction,
  declineAction,
}: {
  view: PublicEstimateView;
  approveAction: () => Promise<{ jobId: string }>;
  declineAction: () => Promise<void>;
}) {
  const { estimate, lines, partyName, businessName, businessWebsite } = view;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<"approved" | "declined" | null>(
    estimate.status === "approved" ? "approved" : estimate.status === "declined" ? "declined" : null,
  );

  const canRespond = !result && (estimate.status === "sent" || estimate.status === "viewed");

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{businessName}</h1>
          {businessWebsite ? <p className="text-sm text-muted-foreground">{businessWebsite}</p> : null}
        </div>
        <Badge variant={result === "approved" ? "default" : result === "declined" ? "destructive" : "outline"}>
          {result ? STATUS_LABEL[result] : (STATUS_LABEL[estimate.status] ?? estimate.status)}
        </Badge>
      </div>

      <div className="rounded-2xl border border-border p-6">
        <p className="text-sm text-muted-foreground">Estimate for</p>
        <p className="text-lg font-medium">{partyName}</p>
        {estimate.number ? <p className="mt-1 text-xs text-muted-foreground">#{estimate.number}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{line.item_name}</TableCell>
                <TableCell className="text-right">{line.quantity}</TableCell>
                <TableCell className="text-right">{inr.format(line.unit_price)}</TableCell>
                <TableCell className="text-right font-medium">
                  {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-end gap-1 text-sm">
        <p>Subtotal: {inr.format(estimate.subtotal)}</p>
        {estimate.cgst_amount > 0 ? <p>CGST: {inr.format(estimate.cgst_amount)}</p> : null}
        {estimate.sgst_amount > 0 ? <p>SGST: {inr.format(estimate.sgst_amount)}</p> : null}
        {estimate.igst_amount > 0 ? <p>IGST: {inr.format(estimate.igst_amount)}</p> : null}
        <p className="text-base font-semibold">Total: {inr.format(estimate.total_amount)}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {result === "approved" ? (
        <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm text-primary">
          Thanks! You approved this estimate -- we'll be in touch to schedule the work.
        </p>
      ) : result === "declined" ? (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">You declined this estimate.</p>
      ) : canRespond ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await declineAction();
                setResult("declined");
              })
            }
          >
            Decline
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              run(async () => {
                await approveAction();
                setResult("approved");
              })
            }
          >
            Approve
          </Button>
        </div>
      ) : null}
    </div>
  );
}
