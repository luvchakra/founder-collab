"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import type { EligibleSalesOrder } from "../../lib/sales-invoices/types";

/** Generate-an-invoice-from-a-sales-order form -- ported from stockpilot-ai-ops's
 * sales-invoices.tsx "New invoice" dialog. Unlike every other create form in this
 * module, there's no line-item entry here -- generate_sales_invoice() copies the
 * order's own lines, so this is just a single select + submit. */
export function GenerateInvoiceModal({
  eligibleSalesOrders,
  onGenerate,
  onClose,
}: {
  eligibleSalesOrders: EligibleSalesOrder[];
  onGenerate: (salesOrderId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedSoId, setSelectedSoId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="gen-invoice-title" className="relative w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="gen-invoice-title" className="text-lg font-semibold">
          Generate invoice
        </h2>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-so">Sales order</Label>
            <NativeSelect id="inv-so" value={selectedSoId} onChange={(e) => setSelectedSoId(e.target.value)}>
              <option value="">Select a confirmed or shipped order</option>
              {eligibleSalesOrders.map((so) => (
                <option key={so.id} value={so.id}>
                  {so.so_number} — {so.customer_name} ({so.status})
                </option>
              ))}
            </NativeSelect>
            {eligibleSalesOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground">No orders are eligible yet — confirm a sales order first.</p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!selectedSoId || pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await onGenerate(selectedSoId);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not generate invoice.");
                  }
                })
              }
            >
              {pending ? "Generating..." : "Generate invoice"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
