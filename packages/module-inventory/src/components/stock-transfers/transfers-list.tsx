"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { TransferForm, type TransferActionState } from "./transfer-form";
import { TransferDetail } from "./transfer-detail";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  CANCELLABLE_STATUSES,
  primaryAction,
  type LookupOption,
  type StockTransfer,
  type StockTransferItem,
} from "../../lib/stock-transfers/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  requested: "outline",
  approved: "outline",
  in_transit: "default",
  received: "secondary",
  completed: "secondary",
  cancelled: "destructive",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/stock-transfers.tsx
 * `StockTransfers` component. Gated on stock_transfers.edit for create/edit;
 * approve/receive/cancel actions each check their own permission server-side and the
 * button is only shown when the caller holds it, matching the original's own
 * canRunPrimaryAction/canApprove/canReceivePermission/canCancel split. */
export function TransfersList({
  transfers,
  warehouses,
  products,
  canEdit,
  canApprove,
  canReceive,
  canCancel,
  createAction,
  updateAction,
  setStatusAction,
  shipAction,
  cancelAction,
  receiveItemAction,
  fetchItems,
}: {
  transfers: StockTransfer[];
  warehouses: LookupOption[];
  products: LookupOption[];
  canEdit: boolean;
  canApprove: boolean;
  canReceive: boolean;
  canCancel: boolean;
  createAction: (prevState: TransferActionState, formData: FormData) => Promise<TransferActionState>;
  updateAction: (
    transferId: string,
    prevState: TransferActionState,
    formData: FormData,
  ) => Promise<TransferActionState>;
  setStatusAction: (transferId: string, status: string) => Promise<void>;
  shipAction: (transferId: string) => Promise<void>;
  cancelAction: (transferId: string) => Promise<void>;
  receiveItemAction: (itemId: string, quantity: number, damaged: number) => Promise<void>;
  fetchItems: (transferId: string) => Promise<StockTransferItem[]>;
}) {
  const [formTarget, setFormTarget] = useState<"create" | StockTransfer | null>(null);
  const [detailTarget, setDetailTarget] = useState<StockTransfer | null>(null);
  const [detailItems, setDetailItems] = useState<StockTransferItem[]>([]);
  const [pending, startTransition] = useTransition();

  const canRunPrimaryAction = (status: string) => {
    if (status === "draft") return canEdit;
    if (status === "requested" || status === "approved") return canApprove;
    if (status === "received") return canReceive;
    return false;
  };

  const openDetail = async (transfer: StockTransfer) => {
    setDetailTarget(transfer);
    setDetailItems(await fetchItems(transfer.id));
  };

  const runPrimaryAction = (transfer: StockTransfer) => {
    const action = primaryAction(transfer.status);
    if (!action) return;
    startTransition(async () => {
      try {
        if (action.kind === "ship") await shipAction(transfer.id);
        else await setStatusAction(transfer.id, action.next);
        if (detailTarget?.id === transfer.id) await openDetail(transfer);
        toast.success(`${transfer.transfer_number}: ${action.label.toLowerCase()} succeeded.`);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : `Could not ${action.label.toLowerCase()} ${transfer.transfer_number}.`,
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setFormTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New stock transfer
          </Button>
        </div>
      ) : null}

      {transfers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <Truck className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No stock transfers yet. Create one to move stock between warehouses.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer #</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.transfer_number}</TableCell>
                  <TableCell className="font-medium">{t.source_warehouse_name}</TableCell>
                  <TableCell className="font-medium">{t.destination_warehouse_name}</TableCell>
                  <TableCell>{formatDate(t.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[t.status]}>{t.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {t.status === "draft" && canEdit ? (
                        <Button variant="ghost" size="sm" onClick={() => setFormTarget(t)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => openDetail(t)}>
                        View
                      </Button>
                      {primaryAction(t.status) && canRunPrimaryAction(t.status) ? (
                        <Button size="sm" disabled={pending} onClick={() => runPrimaryAction(t)}>
                          {primaryAction(t.status)!.label}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {formTarget ? (
        <TransferForm
          action={formTarget === "create" ? createAction : updateAction.bind(null, formTarget.id)}
          warehouses={warehouses}
          products={products}
          transfer={formTarget === "create" ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
        />
      ) : null}

      {detailTarget ? (
        (() => {
          const current = transfers.find((t) => t.id === detailTarget.id) ?? detailTarget;
          const action = primaryAction(current.status);
          return (
            <TransferDetail
              transfer={current}
              items={detailItems}
              canReceive={canReceive}
              canCancel={canCancel && CANCELLABLE_STATUSES.has(current.status)}
              primaryLabel={action && canRunPrimaryAction(current.status) ? action.label : null}
              onReceive={(itemId, quantity, damaged) =>
                startTransition(async () => {
                  try {
                    await receiveItemAction(itemId, quantity, damaged);
                    await openDetail(current);
                    toast.success("Item received.");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not receive item.");
                  }
                })
              }
              onCancel={() =>
                startTransition(async () => {
                  try {
                    await cancelAction(current.id);
                    setDetailTarget(null);
                    toast.success(`${current.transfer_number} cancelled.`);
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : `Could not cancel ${current.transfer_number}.`,
                    );
                  }
                })
              }
              onPrimaryAction={() => runPrimaryAction(current)}
              onClose={() => setDetailTarget(null)}
            />
          );
        })()
      ) : null}
    </div>
  );
}
