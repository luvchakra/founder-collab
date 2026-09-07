"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { Input } from "@cofounderai/core/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { STAGES, type StockTransfer, type StockTransferItem } from "../../lib/stock-transfers/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  requested: "outline",
  approved: "outline",
  in_transit: "default",
  received: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};

function stageIndex(status: string) {
  const idx = STAGES.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

/** Read-only stage stepper + line-item receive form -- ported from stockpilot-ai-ops's
 * StageStepper component and the stock-transfers.tsx detail dialog's receive table. */
export function TransferDetail({
  transfer,
  items,
  canReceive,
  canCancel,
  primaryLabel,
  onReceive,
  onCancel,
  onPrimaryAction,
  onClose,
}: {
  transfer: StockTransfer;
  items: StockTransferItem[];
  canReceive: boolean;
  canCancel: boolean;
  primaryLabel: string | null;
  onReceive: (itemId: string, quantity: number, damaged: number) => void;
  onCancel: () => void;
  onPrimaryAction: () => void;
  onClose: () => void;
}) {
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [damagedQty, setDamagedQty] = useState<Record<string, string>>({});

  if (transfer.status === "cancelled") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <div className="relative w-full max-w-3xl rounded-2xl border bg-popover p-6 shadow-2xl">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            This stock transfer was cancelled.
          </p>
        </div>
      </div>
    );
  }

  const current = stageIndex(transfer.status);
  const lastIndex = STAGES.length - 1;
  const canReceiveNow = canReceive && transfer.status === "in_transit";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{transfer.transfer_number}</h2>
          <Badge variant={STATUS_VARIANT[transfer.status]}>{transfer.status.replace("_", " ")}</Badge>
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
                      complete
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {complete ? <Check className="size-4" /> : i + 1}
                  </div>
                  <span
                    className={`whitespace-nowrap text-[11px] font-medium ${
                      complete || active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
                {i < lastIndex ? (
                  <div className={`mt-3.5 h-0.5 flex-1 ${i < current ? "bg-primary" : "bg-border"}`} />
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Source</p>
            <p className="font-medium">{transfer.source_warehouse_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Destination</p>
            <p className="font-medium">{transfer.destination_warehouse_name}</p>
          </div>
          {transfer.notes ? (
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="font-medium">{transfer.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                {canReceiveNow ? <TableHead className="text-right">Receive</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const remaining = item.quantity - item.received_quantity - item.damaged_quantity;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.item_name} <span className="text-muted-foreground">({item.item_sku ?? "no SKU"})</span>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.received_quantity}</TableCell>
                    <TableCell className="text-right">{item.damaged_quantity}</TableCell>
                    {canReceiveNow ? (
                      <TableCell className="text-right">
                        {remaining <= 0 ? (
                          <span className="text-xs text-muted-foreground">Complete</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={remaining}
                              step="0.01"
                              className="h-8 w-16"
                              placeholder="Good"
                              value={receiveQty[item.id] ?? ""}
                              onChange={(e) => setReceiveQty((q) => ({ ...q, [item.id]: e.target.value }))}
                            />
                            <Input
                              type="number"
                              min={0}
                              max={remaining}
                              step="0.01"
                              className="h-8 w-16"
                              placeholder="Dmg"
                              value={damagedQty[item.id] ?? ""}
                              onChange={(e) => setDamagedQty((q) => ({ ...q, [item.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const good = Number(receiveQty[item.id] || 0);
                                const damaged = Number(damagedQty[item.id] || 0);
                                if (good > 0 || damaged > 0) {
                                  onReceive(item.id, good, damaged);
                                  setReceiveQty((q) => ({ ...q, [item.id]: "" }));
                                  setDamagedQty((q) => ({ ...q, [item.id]: "" }));
                                }
                              }}
                            >
                              Receive
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {canCancel ? (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={onCancel}>
              Cancel transfer
            </Button>
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
