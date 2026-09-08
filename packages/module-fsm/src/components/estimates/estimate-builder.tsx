"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import type { AddChargeLineInput, ChargeableItemOption, Estimate, EstimateLine, UpdateChargeLineInput } from "../../lib/estimates/types";
import type { JobChargeTypeOption } from "../../lib/job-charge-types/types";

/** Reorder via up/down buttons rather than drag-and-drop -- same effect the PRD's own
 * "reorderable by drag handle" calls for, without a new DnD dependency
 * (CLAUDE.md principle 2). */
export function EstimateBuilder({
  estimate,
  lines,
  items,
  jobChargeTypes,
  canEdit,
  addLineAction,
  updateLineAction,
  deleteLineAction,
  reorderAction,
}: {
  /** Null until the first charge is added -- the estimate document is created lazily
   * (addLineAction's own server action resolves-or-creates it). */
  estimate: Estimate | null;
  lines: EstimateLine[];
  items: ChargeableItemOption[];
  jobChargeTypes: JobChargeTypeOption[];
  canEdit: boolean;
  addLineAction: (input: AddChargeLineInput) => Promise<void>;
  updateLineAction: (lineId: string, patch: UpdateChargeLineInput) => Promise<void>;
  deleteLineAction: (lineId: string) => Promise<void>;
  reorderAction: (orderedLineIds: string[]) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [view, setView] = useState<"detailed" | "summary">("detailed");
  const [addOpen, setAddOpen] = useState(false);
  const [adHoc, setAdHoc] = useState(items.length === 0);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const ordered = [...lines];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved!);
    run(() => reorderAction(ordered.map((l) => l.id)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <Button variant={view === "detailed" ? "secondary" : "ghost"} size="sm" onClick={() => setView("detailed")}>
            Detailed
          </Button>
          <Button variant={view === "summary" ? "secondary" : "ghost"} size="sm" onClick={() => setView("summary")}>
            Summary
          </Button>
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add charge
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {view === "summary" ? (
        <div className="rounded-2xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-1 text-3xl font-semibold">{inr.format(estimate?.total_amount ?? 0)}</p>
        </div>
      ) : lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
          No charges added yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Item</TableHead>
                <TableHead>Charge type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead>Taxable</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canEdit ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {canEdit ? (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={pending || i === 0}
                          onClick={() => move(i, -1)}
                          aria-label="Move up"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending || i === lines.length - 1}
                          onClick={() => move(i, 1)}
                          aria-label="Move down"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{line.item_name}</p>
                    {line.item_sku ? <p className="text-xs text-muted-foreground">{line.item_sku}</p> : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{line.job_charge_type_name ?? "-"}</TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">{inr.format(line.unit_price)}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={line.taxable}
                      disabled={!canEdit || pending}
                      onCheckedChange={(checked) => run(() => updateLineAction(line.id, { taxable: checked === true }))}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        onClick={() => run(() => deleteLineAction(line.id))}
                        aria-label="Remove charge"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "detailed" && estimate && lines.length > 0 ? (
        <div className="flex flex-col items-end gap-1 text-sm">
          <p>Subtotal: {inr.format(estimate.subtotal)}</p>
          {estimate.cgst_amount > 0 ? <p>CGST: {inr.format(estimate.cgst_amount)}</p> : null}
          {estimate.sgst_amount > 0 ? <p>SGST: {inr.format(estimate.sgst_amount)}</p> : null}
          {estimate.igst_amount > 0 ? <p>IGST: {inr.format(estimate.igst_amount)}</p> : null}
          <p className="text-base font-semibold">Total: {inr.format(estimate.total_amount)}</p>
        </div>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a charge</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const input: AddChargeLineInput = adHoc
                ? {
                    adHoc: {
                      name: String(form.get("adhoc_name") ?? ""),
                      unitPrice: Number(form.get("unit_price") ?? 0),
                      taxRate: Number(form.get("tax_rate") ?? 0),
                    },
                    quantity: Number(form.get("quantity") ?? 1),
                    taxable: form.get("taxable") === "on",
                    jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                  }
                : {
                    itemId: String(form.get("item_id") ?? ""),
                    quantity: Number(form.get("quantity") ?? 1),
                    taxable: form.get("taxable") === "on",
                    jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                  };
              run(async () => {
                await addLineAction(input);
                setAddOpen(false);
              });
            }}
          >
            {items.length > 0 ? (
              <button type="button" className="self-end text-xs text-muted-foreground underline" onClick={() => setAdHoc((v) => !v)}>
                {adHoc ? "Pick an existing item instead" : "Ad-hoc charge instead"}
              </button>
            ) : null}

            {adHoc ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="adhoc_name" placeholder="Charge description" required className="sm:col-span-2" />
                <Input name="unit_price" type="number" step="0.01" placeholder="Price" required />
                <Input name="tax_rate" type="number" step="0.01" placeholder="Tax rate %" defaultValue={18} />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-item">Item</Label>
                <NativeSelect id="add-item" name="item_id" required>
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-qty">Quantity</Label>
                <Input id="add-qty" name="quantity" type="number" step="0.01" defaultValue={1} required />
              </div>
              {jobChargeTypes.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="add-charge-type">Charge type</Label>
                  <NativeSelect id="add-charge-type" name="job_charge_type_id">
                    <option value="">None</option>
                    {jobChargeTypes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="taxable" defaultChecked />
              Taxable
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Adding..." : "Add charge"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {lines.length > 0 && !estimate?.number ? (
        <Badge variant="secondary" className="self-start">
          Draft -- not yet sent
        </Badge>
      ) : null}
    </div>
  );
}
