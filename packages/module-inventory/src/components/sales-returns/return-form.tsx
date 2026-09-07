"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { REASON_LABEL, REASONS } from "../../lib/sales-returns/types";
import type { EligibleSalesOrder, SalesReturnReason, SoItemForReturn } from "../../lib/sales-returns/types";

export type ReturnActionState = { error: string } | { success: true } | null;

type LineDraft = {
  product_id: string;
  name: string;
  sku: string | null;
  max_quantity: number;
  unit_price: number;
  quantity: string;
  reason: SalesReturnReason;
  restock: boolean;
  is_damaged: boolean;
};

/** Create-a-sales-return form -- ported from stockpilot-ai-ops's sales-returns.tsx
 * dialog. Selecting a sales order loads its own line items as the return's draft lines
 * (matches the original's own useEffect on soItems.data), each independently capped at
 * what was sold, with a per-line reason/restock/damaged disposition. */
export function ReturnForm({
  action,
  eligibleSalesOrders,
  initialSalesOrderId,
  fetchSoItems,
  onClose,
}: {
  action: (prevState: ReturnActionState, formData: FormData) => Promise<ReturnActionState>;
  eligibleSalesOrders: EligibleSalesOrder[];
  initialSalesOrderId?: string;
  fetchSoItems: (salesOrderId: string) => Promise<SoItemForReturn[]>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ReturnActionState, FormData>(action, null);
  const [mounted, setMounted] = useState(false);
  const [selectedSoId, setSelectedSoId] = useState(initialSalesOrderId ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

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

  useEffect(() => {
    if (!selectedSoId) {
      setLines([]);
      return;
    }
    fetchSoItems(selectedSoId).then((items) => {
      setLines(
        items.map((i) => ({
          product_id: i.product_id,
          name: i.item_name,
          sku: i.item_sku,
          max_quantity: i.quantity,
          unit_price: i.unit_price,
          quantity: "0",
          reason: "other",
          restock: true,
          is_damaged: false,
        })),
      );
    });
  }, [selectedSoId, fetchSoItems]);

  const activeLines = lines.filter((l) => Number(l.quantity) > 0);
  const returnValue = activeLines.reduce((sum, l) => sum + Number(l.quantity) * l.unit_price, 0);

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
        aria-labelledby="return-form-title"
        className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="return-form-title" className="text-lg font-semibold">
          New sales return
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="lines" readOnly value={JSON.stringify(activeLines)} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-so">Sales order</Label>
            <NativeSelect id="sr-so" name="sales_order_id" required value={selectedSoId} onChange={(e) => setSelectedSoId(e.target.value)}>
              <option value="">Select a shipped or delivered order</option>
              {eligibleSalesOrders.map((so) => (
                <option key={so.id} value={so.id}>
                  {so.so_number} — {so.customer_name}
                </option>
              ))}
            </NativeSelect>
            {eligibleSalesOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground">No shipped or delivered orders are available to return against.</p>
            ) : null}
          </div>

          {selectedSoId && lines.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Line items</Label>
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div key={line.product_id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {line.name} <span className="text-muted-foreground">({line.sku ?? "no SKU"})</span>
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">Sold: {line.max_quantity}</span>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-24 space-y-1">
                        <Label className="text-xs text-muted-foreground">Return qty</Label>
                        <Input
                          type="number"
                          min={0}
                          max={line.max_quantity}
                          step="0.01"
                          value={line.quantity}
                          onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))}
                        />
                      </div>
                      <div className="min-w-40 flex-1 space-y-1">
                        <Label className="text-xs text-muted-foreground">Reason</Label>
                        <NativeSelect value={line.reason} onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, reason: e.target.value as SalesReturnReason } : l)))}>
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {REASON_LABEL[r]}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                      <label className="flex items-center gap-2 pb-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={line.restock}
                          onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, restock: e.target.checked } : l)))}
                        />
                        Restock
                      </label>
                      {line.restock ? (
                        <label className="flex items-center gap-2 pb-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={line.is_damaged}
                            onChange={(e) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, is_damaged: e.target.checked } : l)))}
                          />
                          Damaged
                        </label>
                      ) : (
                        <span className="pb-1.5 text-xs text-muted-foreground">Credit-only, no restock</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sr-notes">Notes</Label>
            <Input id="sr-notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {activeLines.length > 0 ? (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Return value (before GST)</span>
              <span className="text-base font-semibold">
                {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(returnValue)}
              </span>
            </div>
          ) : null}

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Creating..." disabled={activeLines.length === 0}>
              Create return
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
