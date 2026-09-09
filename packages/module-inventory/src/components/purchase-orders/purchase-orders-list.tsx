"use client";

import { useState, useTransition } from "react";
import { ClipboardList, Pencil, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { PoForm, type PoActionState } from "./po-form";
import { PoDetail } from "./po-detail";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import {
  primaryAction,
  type LookupOption,
  type ProductOption,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type SupplierOption,
} from "../../lib/purchase-orders/types";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "outline",
  approved: "outline",
  sent: "default",
  partially_received: "default",
  received: "secondary",
  closed: "secondary",
  cancelled: "destructive",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/purchase-orders.tsx
 * `PurchaseOrders` component. draft->approved and approved->sent are the approval step
 * (purchase_orders.approve); received->closed is the receiving side's own wrap-up, so
 * either permission covers it -- matches the original's own canPrimaryAction split. */
export function PurchaseOrdersList({
  purchaseOrders,
  suppliers,
  warehouses,
  products,
  canEdit,
  canApprove,
  canReceive,
  createAction,
  updateAction,
  setStatusAction,
  receiveItemAction,
  fetchItems,
}: {
  purchaseOrders: PurchaseOrder[];
  suppliers: SupplierOption[];
  warehouses: LookupOption[];
  products: ProductOption[];
  canEdit: boolean;
  canApprove: boolean;
  canReceive: boolean;
  createAction: (prevState: PoActionState, formData: FormData) => Promise<PoActionState>;
  updateAction: (poId: string, prevState: PoActionState, formData: FormData) => Promise<PoActionState>;
  setStatusAction: (poId: string, status: string) => Promise<void>;
  receiveItemAction: (itemId: string, quantity: number) => Promise<void>;
  fetchItems: (poId: string) => Promise<PurchaseOrderItem[]>;
}) {
  const [formTarget, setFormTarget] = useState<"create" | PurchaseOrder | null>(null);
  const [detailTarget, setDetailTarget] = useState<PurchaseOrder | null>(null);
  const [detailItems, setDetailItems] = useState<PurchaseOrderItem[]>([]);
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([]);
  const [pending, startTransition] = useTransition();

  const canPrimaryAction = (status: string) => {
    if (status === "draft" || status === "approved") return canApprove;
    if (status === "received") return canApprove || canReceive;
    return false;
  };

  const openDetail = async (po: PurchaseOrder) => {
    setDetailTarget(po);
    setDetailItems(await fetchItems(po.id));
  };

  const openEdit = async (po: PurchaseOrder) => {
    setFormItems(await fetchItems(po.id));
    setFormTarget(po);
  };

  const runPrimaryAction = (po: PurchaseOrder) => {
    const action = primaryAction(po.status);
    if (!action) return;
    startTransition(async () => {
      await setStatusAction(po.id, action.next);
      if (detailTarget?.id === po.id) await openDetail(po);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setFormItems([]); setFormTarget("create"); }}>
            <Plus className="size-4" aria-hidden="true" />
            New purchase order
          </Button>
        </div>
      ) : null}

      {purchaseOrders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <ClipboardList className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No purchase orders yet. Create your first one to start receiving stock.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="font-mono text-xs">{po.po_number}</TableCell>
                  <TableCell className="font-medium">{po.supplier_name}</TableCell>
                  <TableCell>{po.warehouse_name}</TableCell>
                  <TableCell>{formatDate(po.order_date)}</TableCell>
                  <TableCell className="text-right">{inr.format(po.total_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[po.status]}>{po.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {po.status === "draft" && canEdit ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(po)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => openDetail(po)}>
                        View
                      </Button>
                      {primaryAction(po.status) && canPrimaryAction(po.status) ? (
                        <Button size="sm" disabled={pending} onClick={() => runPrimaryAction(po)}>
                          {primaryAction(po.status)!.label}
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
        <PoForm
          action={formTarget === "create" ? createAction : updateAction.bind(null, formTarget.id)}
          suppliers={suppliers}
          warehouses={warehouses}
          products={products}
          purchaseOrder={formTarget === "create" ? undefined : formTarget}
          items={formTarget === "create" ? undefined : formItems}
          onClose={() => setFormTarget(null)}
        />
      ) : null}

      {detailTarget
        ? (() => {
            const current = purchaseOrders.find((p) => p.id === detailTarget.id) ?? detailTarget;
            const action = primaryAction(current.status);
            return (
              <PoDetail
                purchaseOrder={current}
                items={detailItems}
                canReceive={canReceive}
                primaryLabel={action && canPrimaryAction(current.status) ? action.label : null}
                onReceive={(itemId, quantity) =>
                  startTransition(async () => {
                    await receiveItemAction(itemId, quantity);
                    await openDetail(current);
                  })
                }
                onPrimaryAction={() => runPrimaryAction(current)}
                onClose={() => setDetailTarget(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
