"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { MOVEMENT_TYPES } from "../../lib/stock/types";
import type { LookupOption } from "../../lib/stock/types";

export type MovementActionState = { error: string } | { success: true } | null;

/** Record-a-stock-movement form -- ported from stockpilot-ai-ops's inventory.tsx
 * "Record movement" dialog into this platform's own hand-rolled overlay pattern.
 * `adjusting` (present when opened from a row's "Adjust" button) pre-selects that
 * product/warehouse and defaults the type to "adjustment", matching the original's own
 * startEdit behavior -- stock on hand isn't edited directly, it's a running total of
 * every movement, so this always posts a new correcting movement rather than mutating a
 * row in place. */
export function MovementModal({
  action,
  products,
  warehouses,
  adjusting,
  onClose,
}: {
  action: (prevState: MovementActionState, formData: FormData) => Promise<MovementActionState>;
  products: LookupOption[];
  warehouses: LookupOption[];
  adjusting?: { productId: string; warehouseId: string; productLabel: string; warehouseLabel: string };
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<MovementActionState, FormData>(action, null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-modal-title"
        className={`relative w-full max-w-lg rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="movement-modal-title" className="text-lg font-semibold">
          {adjusting ? "Edit stock level" : "Record stock movement"}
        </h2>
        {adjusting ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Stock on hand isn&apos;t edited directly -- it&apos;s a running total of every
            movement, so this posts a correcting movement for {adjusting.productLabel} at{" "}
            {adjusting.warehouseLabel} instead.
          </p>
        ) : null}

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-product">Product</Label>
            <NativeSelect
              id="mv-product"
              name="product_id"
              required
              defaultValue={adjusting?.productId ?? ""}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-warehouse">Warehouse</Label>
            <NativeSelect id="mv-warehouse" name="warehouse_id" required defaultValue={adjusting?.warehouseId ?? ""}>
              <option value="">Select warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-type">Type</Label>
              <NativeSelect id="mv-type" name="type" defaultValue={adjusting ? "adjustment" : "inbound"}>
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-qty">Quantity</Label>
              <Input id="mv-qty" name="quantity" type="number" required min={0.01} step="0.01" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-ref">Reference</Label>
            <Input id="mv-ref" name="reference" placeholder="PO-1001, order id, etc." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mv-notes">Notes</Label>
            <Input id="mv-notes" name="notes" />
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Recording...">Record movement</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
