"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";
import type { FsmCustomer } from "../../lib/customers/types";

/** Editing was deliberately left out of this screen at first (PRD §5's route description
 * is a list, not a management screen -- fsm never creates a customer independently, only
 * via `resolveCustomerPartyId()` when an opportunity/job is created) on the assumption
 * inventory's own customer screen would always be there to edit the same row. That's only
 * true when inventory is *also* licensed -- an FSM-only business had no way to fix a
 * customer's email/phone at all. `updateAction` (wired to `updateFsmCustomer`, gated by
 * the existing `customers.edit` permission -- see that mutation's own doc comment for why
 * reusing it doesn't create a hard dependency on inventory) closes that gap without
 * duplicating inventory's own edit UI. */
export function CustomersList({
  customers,
  canEdit,
  updateAction,
}: {
  customers: FsmCustomer[];
  canEdit: boolean;
  updateAction: (
    partyId: string,
    patch: { name?: string; email?: string | null; phone?: string | null },
  ) => Promise<{ error: string } | void>;
}) {
  const [editing, setEditing] = useState<FsmCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (customers.length === 0) {
    return <p className="text-sm text-muted-foreground">No customers yet -- creating an opportunity or job adds one automatically.</p>;
  }

  async function save(form: FormData) {
    if (!editing) return;
    setError(null);
    const result = await updateAction(editing.id, {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
    });
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    setEditing(null);
  }

  return (
    <>
      {/* Compact cards below `md` -- this platform's own rule that a table of rows never
          gets cropped or scrolled sideways on a small screen; a party name, both its own
          columns of counts, and a status badge don't fit seven table columns on a phone. */}
      <ul className="divide-y rounded-lg border md:hidden">
        {customers.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{c.name}</p>
                <p className="text-xs text-muted-foreground">Since {formatDate(c.created_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                {canEdit ? (
                  <Button variant="ghost" size="icon" aria-label="Edit customer" onClick={() => setEditing(c)}>
                    <Pencil className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">Email</span>
                <span className="min-w-0 break-all">{c.email ?? "-"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-foreground">Phone</span>
                <span>{c.phone ?? "-"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                Open jobs <span className="font-medium text-foreground">{c.open_job_count}</span>
              </span>
              <span>
                Open opportunities <span className="font-medium text-foreground">{c.open_opportunity_count}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Open jobs</TableHead>
              <TableHead>Open opportunities</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Since</TableHead>
              {canEdit ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell>{c.email ?? "-"}</TableCell>
                <TableCell>{c.phone ?? "-"}</TableCell>
                <TableCell>{c.open_job_count}</TableCell>
                <TableCell>{c.open_opportunity_count}</TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>{formatDate(c.created_at)}</TableCell>
                {canEdit ? (
                  <TableCell>
                    <Button variant="ghost" size="icon" aria-label="Edit customer" onClick={() => setEditing(c)}>
                      <Pencil className="size-4" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) { setEditing(null); setError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          {editing ? (
            <form action={save} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-name">Name</Label>
                <Input id="cust-name" name="name" defaultValue={editing.name} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input id="cust-email" name="email" type="email" defaultValue={editing.email ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input id="cust-phone" name="phone" defaultValue={editing.phone ?? ""} />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
