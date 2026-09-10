"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@cofounderai/core/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { inr } from "@cofounderai/core/lib/format";
import type { AddChargeLineInput, ChargeableItemOption, Estimate, EstimateLine, UpdateChargeLineInput } from "../../lib/estimates/types";
import type { JobChargeTypeOption } from "../../lib/job-charge-types/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft -- not yet sent",
  sent: "Sent",
  viewed: "Viewed by customer",
  approved: "Approved",
  declined: "Declined",
};
const STATUS_VARIANT: Record<string, "secondary" | "outline" | "default" | "destructive"> = {
  draft: "secondary",
  sent: "outline",
  viewed: "outline",
  approved: "default",
  declined: "destructive",
};

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
  const [editingLine, setEditingLine] = useState<EstimateLine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (fn: () => Promise<void | { error: string }>, onSuccessNotice?: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (result && "error" in result) {
          setError(result.error);
          return;
        }
        if (onSuccessNotice) setNotice(onSuccessNotice);
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Button variant={view === "detailed" ? "secondary" : "ghost"} size="sm" onClick={() => setView("detailed")}>
              Detailed
            </Button>
            <Button variant={view === "summary" ? "secondary" : "ghost"} size="sm" onClick={() => setView("summary")}>
              Summary
            </Button>
          </div>
          {estimate ? <Badge variant={STATUS_VARIANT[estimate.status] ?? "secondary"}>{STATUS_LABEL[estimate.status] ?? estimate.status}</Badge> : null}
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add charge
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {view === "summary" ? (
        <div className="rounded-2xl border border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="mt-1 text-3xl font-semibold">{inr.format(estimate?.total_amount ?? 0)}</p>
        </div>
      ) : lines.length === 0 ? (
        <EmptyState variant="inline" message="No charges added yet." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below `md` -- this platform's own rule that a table of rows
              never gets cropped or scrolled sideways on a small screen. A charge's item
              name has no length limit (it's core.items.name, and a Discovery-mirrored
              item's name can run long), so the table below is genuinely unusable on a
              phone width without this. */}
          <ul className="divide-y md:hidden">
            {lines.map((line, i) => (
              <li key={line.id} className="flex min-w-0 flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{line.item_name}</p>
                    {line.item_sku ? <p className="text-xs text-muted-foreground">{line.item_sku}</p> : null}
                    {line.job_charge_type_name ? (
                      <p className="text-xs text-muted-foreground">{line.job_charge_type_name}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={pending}
                        aria-label="Edit charge"
                        onClick={() => setEditingLine(line)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={pending} aria-label="Remove charge">
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove &quot;{line.item_name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes the charge line from the estimate and cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep charge</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => run(() => deleteLineAction(line.id))}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Qty {line.quantity}</span>
                  <span>{inr.format(line.unit_price)} each</span>
                  <label className="flex items-center gap-1.5">
                    <Checkbox
                      checked={line.taxable}
                      disabled={!canEdit || pending}
                      onCheckedChange={(checked) => run(() => updateLineAction(line.id, { taxable: checked === true }))}
                    />
                    Taxable
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold">
                    {inr.format(line.quantity * line.unit_price + line.cgst_amount + line.sgst_amount + line.igst_amount)}
                  </p>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={pending || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label="Move up"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pending || i === lines.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label="Move down"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
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
                  <TableCell className="max-w-64">
                    <p className="font-medium break-words">{line.item_name}</p>
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          aria-label="Edit charge"
                          onClick={() => setEditingLine(line)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={pending} aria-label="Remove charge">
                              <Trash2 className="size-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove &quot;{line.item_name}&quot;?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the charge line from the estimate and cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep charge</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => run(() => deleteLineAction(line.id))}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
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
            action={async (form: FormData) => {
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
              setError(null);
              setNotice(null);
              try {
                await addLineAction(input);
                setAddOpen(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
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
              <SubmitButton pendingText="Adding...">Add charge</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingLine !== null} onOpenChange={(open) => { if (!open) setEditingLine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit charge</DialogTitle>
          </DialogHeader>
          {editingLine ? (
            <form
              className="flex flex-col gap-4"
              action={async (form: FormData) => {
                const lineId = editingLine.id;
                const patch: UpdateChargeLineInput = {
                  quantity: Number(form.get("quantity") ?? 0),
                  unitPrice: Number(form.get("unit_price") ?? 0),
                  taxRate: Number(form.get("tax_rate") ?? 0),
                  taxable: form.get("taxable") === "on",
                  jobChargeTypeId: String(form.get("job_charge_type_id") ?? "") || null,
                };
                setError(null);
                setNotice(null);
                try {
                  await updateLineAction(lineId, patch);
                  setEditingLine(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Something went wrong.");
                }
              }}
            >
              <div>
                <p className="text-sm font-medium break-words">{editingLine.item_name}</p>
                {editingLine.item_sku ? <p className="text-xs text-muted-foreground">{editingLine.item_sku}</p> : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-qty">Quantity</Label>
                  <Input id="edit-qty" name="quantity" type="number" step="0.01" defaultValue={editingLine.quantity} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-price">Unit price</Label>
                  <Input id="edit-price" name="unit_price" type="number" step="0.01" defaultValue={editingLine.unit_price} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-tax-rate">Tax rate %</Label>
                  <Input id="edit-tax-rate" name="tax_rate" type="number" step="0.01" defaultValue={editingLine.tax_rate} required />
                </div>
                {jobChargeTypes.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-charge-type">Charge type</Label>
                    <NativeSelect id="edit-charge-type" name="job_charge_type_id" defaultValue={editingLine.job_charge_type_id ?? ""}>
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
                <Checkbox name="taxable" defaultChecked={editingLine.taxable} />
                Taxable
              </label>

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditingLine(null)}>
                  Cancel
                </Button>
                <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
