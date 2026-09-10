"use client";

import { useState } from "react";
import { Pencil, Plus, Star, Truck } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
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
        <EmptyState icon={Truck} message="No suppliers yet. Add your first one." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {suppliers.map((sup) => (
              <li key={sup.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium">{sup.name}</p>
                  <Badge variant={sup.is_active ? "default" : "secondary"} className="shrink-0">
                    {sup.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{sup.contact_person ?? "—"}</span>
                  <span>{sup.phone ?? "—"}</span>
                  <span>Lead time {sup.lead_time_days}d</span>
                  {Number(sup.rating) > 0 ? (
                    <span className="flex items-center gap-1">
                      <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                      {Number(sup.rating).toFixed(1)}
                    </span>
                  ) : null}
                </div>

                {canEdit ? (
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
                ) : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
