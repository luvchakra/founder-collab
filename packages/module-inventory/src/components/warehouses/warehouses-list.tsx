"use client";

import { useState } from "react";
import { Pencil, Plus, Warehouse as WarehouseIcon } from "lucide-react";
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
import { WarehouseModal, type WarehouseActionState } from "./warehouse-modal";
import type { Warehouse } from "../../lib/warehouses/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/warehouses.tsx `Warehouses`
 * component -- list + create/edit dialog + activate/deactivate, rebuilt as Server
 * Actions instead of react-query mutations (this platform has no react-query dependency
 * and an established Server Action convention -- see AiActionForm/EditableText). Keeps
 * its own compact-card mobile layout below `md` (CLAUDE.md rule #12) -- warehouse names
 * can be long and six columns doesn't fit a phone width. */
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
        <EmptyState icon={WarehouseIcon} message="No warehouses yet. Create your first one." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. */}
          <ul className="divide-y md:hidden">
            {warehouses.map((wh) => (
              <li key={wh.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{wh.name}</p>
                    <p className="text-xs text-muted-foreground">{wh.code}</p>
                  </div>
                  <Badge variant={wh.is_active ? "default" : "secondary"} className="shrink-0">
                    {wh.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{wh.city ?? "—"}</span>
                  <span>{wh.state ?? "—"}</span>
                  <span>{wh.contact_name ?? wh.contact_phone ?? "—"}</span>
                </div>

                {canEdit ? (
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
                ) : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
