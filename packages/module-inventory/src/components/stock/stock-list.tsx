"use client";

import { useState } from "react";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { MovementModal, type MovementActionState } from "./movement-modal";
import { num } from "@cofounderai/core/lib/format";
import type { LookupOption, StockLevel } from "../../lib/stock/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/inventory.tsx `Inventory`
 * component -- a read-mostly stock-levels table plus a "Record movement" form (stock on
 * hand is never edited directly, only ever a running total of posted movements). Gated
 * on `inventory.edit`, matching the original's own `can("inventory.edit")` check. */
export function StockList({
  levels,
  products,
  warehouses,
  canEdit,
  recordAction,
}: {
  levels: StockLevel[];
  products: LookupOption[];
  warehouses: LookupOption[];
  canEdit: boolean;
  recordAction: (prevState: MovementActionState, formData: FormData) => Promise<MovementActionState>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<
    { productId: string; warehouseId: string; productLabel: string; warehouseLabel: string } | undefined
  >(undefined);

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setAdjusting(undefined);
              setModalOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Record movement
          </Button>
        </div>
      ) : null}

      {levels.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <RefreshCw className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No stock recorded yet. Record your first movement to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Expired</TableHead>
                <TableHead className="text-right">Incoming</TableHead>
                <TableHead className="text-right">In transit</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((row) => {
                const available = row.quantity - row.reserved - row.damaged - row.expired;
                const low = row.reorder_point > 0 && row.quantity <= row.reorder_point;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.item_name}{" "}
                      <span className="text-muted-foreground">({row.item_sku ?? "no SKU"})</span>
                    </TableCell>
                    <TableCell>{row.warehouse_name}</TableCell>
                    <TableCell className={`text-right ${low ? "font-semibold text-destructive" : ""}`}>
                      {num.format(row.quantity)}
                    </TableCell>
                    <TableCell className="text-right font-medium">{num.format(available)}</TableCell>
                    <TableCell className="text-right">{num.format(row.reserved)}</TableCell>
                    <TableCell className="text-right">{num.format(row.damaged)}</TableCell>
                    <TableCell className="text-right">{num.format(row.expired)}</TableCell>
                    <TableCell className="text-right">{num.format(row.incoming)}</TableCell>
                    <TableCell className="text-right">{num.format(row.in_transit)}</TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjusting({
                              productId: row.item_id,
                              warehouseId: row.warehouse_id,
                              productLabel: row.item_name,
                              warehouseLabel: row.warehouse_name,
                            });
                            setModalOpen(true);
                          }}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                          Adjust
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {modalOpen ? (
        <MovementModal
          action={recordAction}
          products={products}
          warehouses={warehouses}
          adjusting={adjusting}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
