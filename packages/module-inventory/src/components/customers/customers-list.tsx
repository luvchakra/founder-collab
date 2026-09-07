"use client";

import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
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
import { CustomerModal, type CustomerActionState } from "./customer-modal";
import type { Customer } from "../../lib/customers/types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/customers.tsx `Customers`
 * component -- list + create/edit dialog + activate/deactivate, rebuilt as Server
 * Actions (see WarehousesList's docstring for why). Gated on `customers.edit`, matching
 * the original's own `can("customers.edit")` check and the seeded permission catalog. */
export function CustomersList({
  customers,
  canEdit,
  createAction,
  updateAction,
  toggleActiveAction,
}: {
  customers: Customer[];
  canEdit: boolean;
  createAction: (prevState: CustomerActionState, formData: FormData) => Promise<CustomerActionState>;
  updateAction: (
    customerId: string,
    prevState: CustomerActionState,
    formData: FormData,
  ) => Promise<CustomerActionState>;
  toggleActiveAction: (customerId: string, isActive: boolean) => Promise<void>;
}) {
  const [modalTarget, setModalTarget] = useState<"create" | Customer | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setModalTarget("create")}>
            <Plus className="size-4" aria-hidden="true" />
            New customer
          </Button>
        </div>
      ) : null}

      {customers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No customers yet. Add your first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>State</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Status</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((cust) => (
                <TableRow key={cust.id}>
                  <TableCell className="font-medium">{cust.name}</TableCell>
                  <TableCell>{cust.phone ?? "—"}</TableCell>
                  <TableCell>{cust.email ?? "—"}</TableCell>
                  <TableCell>{cust.state ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{cust.gstin ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={cust.is_active ? "default" : "secondary"}>
                      {cust.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  {canEdit ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setModalTarget(cust)}>
                          <Pencil className="size-4" aria-hidden="true" />
                          Edit
                        </Button>
                        <form action={toggleActiveAction.bind(null, cust.id, !cust.is_active)}>
                          <SubmitButton variant="ghost" size="sm">
                            {cust.is_active ? "Deactivate" : "Activate"}
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
        <CustomerModal
          action={modalTarget === "create" ? createAction : updateAction.bind(null, modalTarget.id)}
          customer={modalTarget === "create" ? undefined : modalTarget}
          onClose={() => setModalTarget(null)}
        />
      ) : null}
    </div>
  );
}
