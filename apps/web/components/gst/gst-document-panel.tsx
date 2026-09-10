"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { ContractEinvoice, ContractEwayBill } from "@cofounderai/module-gst/contract/types";

/**
 * S-2's own manual generate/cancel panel for one `core.documents` row -- mounted below
 * `apps/web`'s own invoice detail page(s). `apps/web` is the composition root (exempt
 * from the module-to-module contract-only restriction) so this lives here rather than
 * inside `module-fsm`'s/`module-inventory`'s own invoice-detail components, which may
 * only import `@cofounderai/module-gst/contract`, not its UI or lib internals.
 *
 * Only FSM's own invoice detail page mounts this so far -- Inventory's own Sales Invoice
 * detail is a client modal (`invoices-list.tsx`/`invoice-detail.tsx`) whose data-fetch-
 * on-open flow would need its own follow-up to thread gst status through; deferred,
 * documented alongside this story in docs/EPIC6-PROGRESS.md.
 */
export function GstDocumentPanel({
  canGenerate,
  einvoice,
  ewayBill,
  generateEinvoiceAction,
  cancelEinvoiceAction,
  generateEwayBillAction,
  cancelEwayBillAction,
}: {
  canGenerate: boolean;
  einvoice: ContractEinvoice | null;
  ewayBill: ContractEwayBill | null;
  generateEinvoiceAction: () => Promise<void>;
  cancelEinvoiceAction: (reason?: string) => Promise<void>;
  generateEwayBillAction: () => Promise<void>;
  cancelEwayBillAction: (reason?: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">GST compliance</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <DocRow
          label="e-Invoice (IRN)"
          canGenerate={canGenerate}
          generated={einvoice?.status === "generated"}
          cancelled={einvoice?.status === "cancelled"}
          fields={einvoice ? [["IRN", einvoice.irn], ["Ack no.", einvoice.ackNo], ["Ack date", einvoice.ackDate ? formatDateTime(einvoice.ackDate) : null]] : []}
          onGenerate={generateEinvoiceAction}
          onCancel={cancelEinvoiceAction}
        />
        <DocRow
          label="e-Way Bill"
          canGenerate={canGenerate}
          generated={ewayBill?.status === "generated"}
          cancelled={ewayBill?.status === "cancelled"}
          fields={ewayBill ? [["e-Way Bill no.", ewayBill.ewayBillNumber], ["Valid until", ewayBill.validUntil ? formatDateTime(ewayBill.validUntil) : null]] : []}
          onGenerate={generateEwayBillAction}
          onCancel={cancelEwayBillAction}
        />
      </div>
    </div>
  );
}

function DocRow({
  label,
  canGenerate,
  generated,
  cancelled,
  fields,
  onGenerate,
  onCancel,
}: {
  label: string;
  canGenerate: boolean;
  generated: boolean;
  cancelled: boolean;
  fields: [string, string | null][];
  onGenerate: () => Promise<void>;
  onCancel: (reason?: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setCancelling(false);
        setReason("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {cancelled ? (
          <Badge variant="outline">Cancelled</Badge>
        ) : generated ? (
          <Badge>Generated</Badge>
        ) : (
          <Badge variant="secondary">Not generated</Badge>
        )}
      </div>

      {generated && !cancelled ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          {fields.map(([fieldLabel, value]) => (
            <div key={fieldLabel} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span className="shrink-0">{fieldLabel}</span>
              {/* IRNs run ~64 chars with no natural break point -- break-all (not
                  break-words, which only breaks at whitespace) so a long value wraps
                  inside the card instead of running past its right edge. */}
              <span className="min-w-0 font-mono break-all sm:text-right">{value ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {canGenerate ? (
        !generated || cancelled ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(onGenerate)}>
            {pending ? "Generating..." : "Generate"}
          </Button>
        ) : cancelling ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${label}-reason`} className="text-xs">
              Cancellation reason (optional)
            </Label>
            <Input id={`${label}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCancelling(false)}>
                Back
              </Button>
              <Button size="sm" variant="destructive" disabled={pending} onClick={() => run(() => onCancel(reason || undefined))}>
                {pending ? "Cancelling..." : "Confirm cancel"}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>
            Cancel
          </Button>
        )
      ) : null}
    </div>
  );
}
