"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Truck } from "lucide-react";
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
import { SupplierModal, type SupplierActionState } from "./supplier-modal";
import type { Supplier } from "../../lib/suppliers/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/suppliers.tsx `Suppliers`
 * component -- list + create/edit dialog + activate/deactivate, rebuilt as Server
 * Actions (see WarehousesList's docstring for why). Gated on `suppliers.edit`, not
 * `inventory.edit` -- matches the original's own `can("suppliers.edit")` check and the
 * seeded permission catalog (`core.permissions`), which keys suppliers separately from
 * general inventory. */
export function SuppliersList({
  suppliers,
  canEdit,
  createAction,
  updateAction,
  toggleActiveAction,
}: {
  suppliers: Supplier[];
  canEdit: boolean;
  createAction: (prevState: SupplierActionState, formData: FormData) => Promise<SupplierActionState>;
  updateAction: (
    supplierId: string,
    prevState: SupplierActionState,
    formData: FormData,
  ) => Promise<SupplierActionState>;
  toggleActiveAction: (supplierId: string, isActive: boolean) => Promise<void>;
}) {
  const [modalTarget, setModalTarget] = useState<"create" | Supplier | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New supplier
          </Button>
        </div>
      ) : null}

      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <Truck className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No suppliers yet. Add your first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((sup) => (
                <TableRow key={sup.id}>
                  <TableCell className="font-medium">{sup.name}</TableCell>
                  <TableCell>{sup.contact_person ?? "—"}</TableCell>
                  <TableCell>{sup.phone ?? "—"}</TableCell>
                  <TableCell>{sup.lead_time_days}d</TableCell>
                  <TableCell>
                    {Number(sup.rating) > 0 ? (
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                        {Number(sup.rating).toFixed(1)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sup.is_active ? "default" : "secondary"}>
                      {sup.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setModalTarget(sup)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <form action={toggleActiveAction.bind(null, sup.id, !sup.is_active)}>
                          <SubmitButton variant="ghost" size="sm">
                            {sup.is_active ? "Deactivate" : "Activate"}
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
        <SupplierModal
          action={modalTarget === "create" ? createAction : updateAction.bind(null, modalTarget.id)}
          supplier={modalTarget === "create" ? undefined : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  );
}
