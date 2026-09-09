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
import { STAGES, type SalesOrder, type SalesOrderItem } from "../../lib/sales-orders/types";
import { inr } from "@cofounderai/core/lib/format";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  confirmed: "outline",
  processing: "outline",
  packed: "outline",
  shipped: "default",
  delivered: "secondary",
  cancelled: "destructive",
  returned: "destructive",
};

function stageIndex(status: string) {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

/** Ported from stockpilot-ai-ops's sales-orders.tsx StageStepper + detail-dialog line
 * table + totals breakdown + Cancel/Create-return action row. */
export function SoDetail({
  salesOrder,
  items,
  canCancel,
  canCreateReturn,
  primaryLabel,
  onCancel,
  onCreateReturn,
  onPrimaryAction,
  onClose,
}: {
  salesOrder: SalesOrder;
  items: SalesOrderItem[];
  canCancel: boolean;
  canCreateReturn: boolean;
  primaryLabel: string | null;
  onCancel: () => void;
  onCreateReturn: () => void;
  onPrimaryAction: () => void;
  onClose: () => void;
}) {
  if (salesOrder.status === "cancelled" || salesOrder.status === "returned") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-3xl rounded-2xl border bg-popover p-6 shadow-2xl">
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="size-5" aria-hidden="true" />
          </button>
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            This sales order was {salesOrder.status}.
          </p>
        </div>
      </div>
    );
  }

  const current = stageIndex(salesOrder.status);
  const lastIndex = STAGES.length - 1;
  const canReturnNow = canCreateReturn && (salesOrder.status === "shipped" || salesOrder.status === "delivered");

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{salesOrder.so_number}</h2>
          <Badge variant={STATUS_VARIANT[salesOrder.status]}>{salesOrder.status}</Badge>
        </div>

        <div className="mt-5 flex items-start">
          {STAGES.map((stage, i) => {
            const complete = i < current || (i === current && i === lastIndex);
            const active = i === current && !complete;
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
            <p className="font-medium">{salesOrder.customer_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Warehouse</p>
            <p className="font-medium">{salesOrder.warehouse_name}</p>
          </div>
          {salesOrder.notes ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="font-medium">{salesOrder.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">GST</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.item_name} <span className="text-muted-foreground">({item.item_sku ?? "no SKU"})</span>
                  </TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{inr.format(item.unit_price)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{item.tax_rate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 space-y-1 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{inr.format(salesOrder.subtotal)}</span>
          </div>
          {salesOrder.igst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>IGST</span>
              <span>{inr.format(salesOrder.igst_amount)}</span>
            </div>
          ) : null}
          {salesOrder.cgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>CGST</span>
              <span>{inr.format(salesOrder.cgst_amount)}</span>
            </div>
          ) : null}
          {salesOrder.sgst_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>SGST</span>
              <span>{inr.format(salesOrder.sgst_amount)}</span>
            </div>
          ) : null}
          {salesOrder.shipping_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>{inr.format(salesOrder.shipping_amount)}</span>
            </div>
          ) : null}
          {salesOrder.discount_amount > 0 ? (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{inr.format(salesOrder.discount_amount)}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span>{inr.format(salesOrder.total_amount)}</span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {canReturnNow ? (
            <Button variant="outline" onClick={onCreateReturn}>
              Create return
            </Button>
          ) : null}
          {canCancel ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  Cancel order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel {salesOrder.so_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This cancels the sales order and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep order</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onCancel}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel order
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
