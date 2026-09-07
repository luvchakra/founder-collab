"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { LookupOption, StockTransfer, StockTransferItem } from "../../lib/stock-transfers/types";

export type TransferActionState = { error: string } | { success: true } | null;

type LineDraft = { product_id: string; quantity: string };
const emptyLine = (): LineDraft => ({ product_id: "", quantity: "1" });

/** Create/edit stock-transfer form -- ported from stockpilot-ai-ops's stock-transfers.tsx
 * dialog into this platform's own hand-rolled overlay pattern. Line items are dynamic
 * (add/remove rows), submitted as one JSON-encoded hidden field since Server Actions
 * read plain FormData -- the first multi-line form in this module, reused by every
 * later one (purchase orders, sales orders). */
export function TransferForm({
  action,
  warehouses,
  products,
  transfer,
  items,
  onClose,
}: {
  action: (prevState: TransferActionState, formData: FormData) => Promise<TransferActionState>;
  warehouses: LookupOption[];
  products: LookupOption[];
  /** Present when editing an existing draft transfer; absent when creating one. */
  transfer?: StockTransfer;
  items?: StockTransferItem[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<TransferActionState, FormData>(action, null);
  const [mounted, setMounted] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState(transfer?.source_warehouse_id ?? "");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(transfer?.destination_warehouse_id ?? "");
  const [lines, setLines] = useState<LineDraft[]>(
    items && items.length > 0
      ? items.map((i) => ({ product_id: i.item_id, quantity: String(i.quantity) }))
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
        aria-labelledby="transfer-form-title"
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

        <h2 id="transfer-form-title" className="text-lg font-semibold">
          {transfer ? "Edit stock transfer" : "New stock transfer"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="lines" readOnly value={JSON.stringify(validLines)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-source">Source warehouse</Label>
              <NativeSelect
                id="st-source"
                name="source_warehouse_id"
                required
                value={sourceWarehouseId}
                onChange={(e) => setSourceWarehouseId(e.target.value)}
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
              <Label htmlFor="st-destination">Destination warehouse</Label>
              <NativeSelect
                id="st-destination"
                name="destination_warehouse_id"
                required
                value={destinationWarehouseId}
                onChange={(e) => setDestinationWarehouseId(e.target.value)}
              >
                <option value="">Select warehouse</option>
                {warehouses.filter((w) => w.id !== sourceWarehouseId).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-notes">Notes</Label>
            <Input id="st-notes" name="notes" defaultValue={transfer?.notes ?? ""} />
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
                    onChange={(e) =>
                      setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, product_id: e.target.value } : l)))
                    }
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton
              pendingText={transfer ? "Saving..." : "Creating..."}
              disabled={!sourceWarehouseId || !destinationWarehouseId || validLines.length === 0}
            >
              {transfer ? "Save changes" : "Create stock transfer"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
