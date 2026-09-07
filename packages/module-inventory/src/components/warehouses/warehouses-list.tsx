"use client";

import { useState } from "react";
import { Pencil, Plus, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { WarehouseModal, type WarehouseActionState } from "./warehouse-modal";
import type { Warehouse } from "../../lib/warehouses/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/warehouses.tsx `Warehouses`
 * component -- list + create/edit dialog + activate/deactivate, rebuilt as Server
 * Actions instead of react-query mutations (this platform has no react-query dependency
 * and an established Server Action convention -- see AiActionForm/EditableText). The
 * StockPilot original's separate `sm:hidden` mobile card layout is dropped for this
 * first pass; the table scrolls horizontally on narrow screens instead. */
export function WarehousesList({
  warehouses,
  canEdit,
  createAction,
  updateAction,
  toggleActiveAction,
}: {
  warehouses: Warehouse[];
  canEdit: boolean;
  createAction: (prevState: WarehouseActionState, formData: FormData) => Promise<WarehouseActionState>;
  updateAction: (
    warehouseId: string,
    prevState: WarehouseActionState,
    formData: FormData,
  ) => Promise<WarehouseActionState>;
  toggleActiveAction: (warehouseId: string, isActive: boolean) => Promise<void>;
}) {
  const [modalTarget, setModalTarget] = useState<"create" | Warehouse | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New warehouse
          </Button>
        </div>
      ) : null}

      {warehouses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <WarehouseIcon className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No warehouses yet. Create your first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((wh) => (
                <TableRow key={wh.id}>
                  <TableCell className="font-medium">{wh.name}</TableCell>
                  <TableCell>{wh.code}</TableCell>
                  <TableCell>{wh.city ?? "—"}</TableCell>
                  <TableCell>{wh.state ?? "—"}</TableCell>
                  <TableCell>{wh.contact_name ?? wh.contact_phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={wh.is_active ? "default" : "secondary"}>
                      {wh.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setModalTarget(wh)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <form action={toggleActiveAction.bind(null, wh.id, !wh.is_active)}>
                          <SubmitButton variant="ghost" size="sm">
                            {wh.is_active ? "Deactivate" : "Activate"}
                          </SubmitButton>
                        </form>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {modalTarget ? (
        <WarehouseModal
          action={modalTarget === "create" ? createAction : updateAction.bind(null, modalTarget.id)}
          warehouse={modalTarget === "create" ? undefined : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  );
}
