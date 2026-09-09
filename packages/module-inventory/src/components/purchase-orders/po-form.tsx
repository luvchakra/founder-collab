"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { GST_RATE_SLABS } from "@cofounderai/core/lib/gst";
import type { LookupOption, ProductOption, PurchaseOrder, PurchaseOrderItem, SupplierOption } from "../../lib/purchase-orders/types";

export type PoActionState = { error: string } | { success: true } | null;

type LineDraft = { product_id: string; quantity: string; unit_cost: string; tax_rate: string };
const emptyLine = (): LineDraft => ({ product_id: "", quantity: "1", unit_cost: "0", tax_rate: "0" });

/** Create/edit purchase-order form -- ported from stockpilot-ai-ops's
 * purchase-orders.tsx dialog, following the multi-line-form pattern TransferForm
 * established. GST is computed authoritatively server-side in the mutation (see
 * lib/purchase-orders/mutations.ts's own docstring for why), so this form doesn't need
 * to compute or display a live tax preview -- it just submits the raw line items. */
export function PoForm({
  action,
  suppliers,
  warehouses,
  products,
  purchaseOrder,
  items,
  onClose,
}: {
  action: (prevState: PoActionState, formData: FormData) => Promise<PoActionState>;
  suppliers: SupplierOption[];
  warehouses: LookupOption[];
  products: ProductOption[];
  purchaseOrder?: PurchaseOrder;
  items?: PurchaseOrderItem[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<PoActionState, FormData>(action, null);
  const [mounted, setMounted] = useState(false);
  const [supplierId, setSupplierId] = useState(purchaseOrder?.supplier_id ?? "");
  const [warehouseId, setWarehouseId] = useState(purchaseOrder?.warehouse_id ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    items && items.length > 0
      ? items.map((i) => ({
          product_id: i.product_id,
          quantity: String(i.quantity),
          unit_cost: String(i.unit_cost),
          tax_rate: String(i.tax_rate),
        }))
      : [emptyLine()],
  );

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

  const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0);

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
        aria-labelledby="po-form-title"
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
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

        <h2 id="po-form-title" className="text-lg font-semibold">
          {purchaseOrder ? "Edit purchase order" : "New purchase order"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="lines" readOnly value={JSON.stringify(validLines)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-supplier">Supplier</Label>
              <NativeSelect
                id="po-supplier"
                name="supplier_id"
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-warehouse">Receiving warehouse</Label>
              <NativeSelect
                id="po-warehouse"
                name="warehouse_id"
                required
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-delivery">Expected delivery</Label>
              <Input
                id="po-delivery"
                name="expected_delivery_date"
                type="date"
                defaultValue={purchaseOrder?.expected_delivery_date ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-notes">Notes</Label>
              <Input id="po-notes" name="notes" defaultValue={purchaseOrder?.notes ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
                <Plus className="size-4" aria-hidden="true" />
                Add line
              </Button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <div className="w-full space-y-1 sm:min-w-0 sm:flex-1">
                  <Label className="text-xs text-muted-foreground">Product</Label>
                  <NativeSelect
                    value={line.product_id}
                    onChange={(e) => {
                      const product = products.find((p) => p.id === e.target.value);
                      setLines((ls) =>
                        ls.map((l, i) =>
                          i === idx
                            ? {
                                ...l,
                                product_id: e.target.value,
                                unit_cost: product ? String(product.cost_price ?? 0) : l.unit_cost,
                                tax_rate: product ? String(product.tax_rate) : l.tax_rate,
                              }
                            : l,
                        ),
                      );
                    }}
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs text-muted-foreground">Unit cost</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.unit_cost}
                    onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unit_cost: e.target.value } : l)))}
                  />
                </div>
                <div className="w-20 space-y-1">
                  <Label className="text-xs text-muted-foreground">GST %</Label>
                  <NativeSelect
                    value={line.tax_rate}
                    onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, tax_rate: e.target.value } : l)))}
                  >
                    {GST_RATE_SLABS.map((rate) => (
                      <option key={rate} value={String(rate)}>
                        {rate}%
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                  aria-label="Remove line item"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-discount">Discount</Label>
              <Input id="po-discount" name="discount_amount" type="number" min={0} step="0.01" defaultValue={purchaseOrder?.discount_amount ?? 0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="po-shipping">Shipping</Label>
              <Input id="po-shipping" name="shipping_amount" type="number" min={0} step="0.01" defaultValue={purchaseOrder?.shipping_amount ?? 0} />
            </div>
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton
              pendingText={purchaseOrder ? "Saving..." : "Creating..."}
              disabled={!supplierId || !warehouseId || validLines.length === 0}
            >
              {purchaseOrder ? "Save changes" : "Create purchase order"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
