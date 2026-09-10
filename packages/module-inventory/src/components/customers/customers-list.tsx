"use client";

import { useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
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
        <EmptyState icon={Users} message="No customers yet. Add your first one." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen; customer names
              here are often long ("Greenfield Residency Owners Association"), so they get
              their own wrapping row rather than being squeezed into a table cell. */}
          <ul className="divide-y md:hidden">
            {customers.map((cust) => (
              <li key={cust.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-medium">{cust.name}</p>
                  <Badge variant={cust.is_active ? "default" : "secondary"} className="shrink-0">
                    {cust.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{cust.phone ?? "—"}</span>
                  <span className="break-words">{cust.email ?? "—"}</span>
                  <span>{cust.state ?? "—"}</span>
                  <span className="font-mono">{cust.gstin ?? "—"}</span>
                </div>

                {canEdit ? (
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
                ) : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
