"use client";

import { Check, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { REASON_LABEL, STAGES, type SalesReturn, type SalesReturnItem } from "../../lib/sales-returns/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  approved: "outline",
  completed: "default",
  cancelled: "destructive",
};

function stageIndex(status: string) {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

/** Ported from stockpilot-ai-ops's sales-returns.tsx StageStepper + detail-dialog line
 * table + Cancel/primary-action row. */
export function ReturnDetail({
  salesReturn,
  items,
  canCancel,
  primaryLabel,
  onCancel,
  onPrimaryAction,
  onClose,
}: {
  salesReturn: SalesReturn;
  items: SalesReturnItem[];
  canCancel: boolean;
  primaryLabel: string | null;
  onCancel: () => void;
  onPrimaryAction: () => void;
  onClose: () => void;
}) {
  if (salesReturn.status === "cancelled") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-3xl rounded-2xl border bg-popover p-6 shadow-2xl">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            This sales return was cancelled.
          </p>
        </div>
      </div>
    );
  }

  const current = stageIndex(salesReturn.status);
  const lastIndex = STAGES.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{salesReturn.return_number}</h2>
          <Badge variant={STATUS_VARIANT[salesReturn.status]}>{salesReturn.status}</Badge>
        </div>

        <div className="mt-5 flex items-start">
          {STAGES.map((stage, i) => {
            const complete = i < current;
            const active = i === current;
            return (
              <div key={stage.key} className="flex flex-1 items-start last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                      complete ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {complete ? <Check className="size-4" /> : i + 1}
                  </div>
                  <span className={`whitespace-nowrap text-[11px] font-medium ${complete || active ? "text-foreground" : "text-muted-foreground"}`}>
                    {stage.label}
                  </span>
                </div>
                {i < lastIndex ? <div className={`mt-3.5 h-0.5 flex-1 ${i < current ? "bg-primary" : "bg-border"}`} /> : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Sales order</p>
            <p className="font-medium">{salesReturn.so_number}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
            <p className="font-medium">{salesReturn.customer_name}</p>
          </div>
          {salesReturn.credit_note_number ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Credit note</p>
              <p className="font-medium">{salesReturn.credit_note_number}</p>
            </div>
          ) : null}
          {salesReturn.notes ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="font-medium">{salesReturn.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Disposition</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.item_name} <span className="text-muted-foreground">({item.item_sku ?? "no SKU"})</span>
                  </TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-muted-foreground">{REASON_LABEL[item.reason]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.restock ? (item.is_damaged ? "Restock (damaged)" : "Restock (good)") : "Credit-only"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {salesReturn.status === "draft" && canCancel ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  Cancel return
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this return?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cancels the sales return and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep return</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onCancel}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel return
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {primaryLabel ? (
            <Button size="lg" onClick={onPrimaryAction}>
              {primaryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
