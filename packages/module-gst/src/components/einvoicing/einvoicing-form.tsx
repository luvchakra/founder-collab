"use client";

import { useActionState } from "react";
import { Label } from "@cofounderai/core/ui/label";
import { Input } from "@cofounderai/core/ui/input";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { EinvoiceCredentialsStatus } from "../../lib/einvoicing/types";

export type EinvoicingActionState = { error: string } | { success: true } | null;

/**
 * e-Invoicing (IRN + QR code) credentials form -- ported from stockpilot-ai-ops's
 * account.tsx "e-Invoicing (IRN + QR code)" card. Same write-only shape as
 * EwayBillForm: only `gsp_provider` is ever pre-filled, everything else starts blank on
 * every render since none of it is ever readable back (no SELECT grant).
 */
export function EinvoicingForm({
  status,
  canEdit,
  action,
}: {
  status: EinvoiceCredentialsStatus | null;
  canEdit: boolean;
  action: (prevState: EinvoicingActionState, formData: FormData) => Promise<EinvoicingActionState>;
}) {
  const [state, formAction] = useActionState<EinvoicingActionState, FormData>(action, null);

  if (!canEdit) {
    return (
      <p className="max-w-lg text-sm text-muted-foreground">
        {status
          ? `Configured: ${status.gsp_provider} · last updated ${formatDateTime(status.updated_at)}`
          : "No e-Invoicing provider configured yet."}
      </p>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-xs text-muted-foreground">
        e-Invoicing submits sales invoices to the government&apos;s Invoice Registration Portal
        (IRP) through your GST Suvidha Provider (GSP), returning an IRN and QR code. Enter the
        base URLs and credentials your GSP issued you — these can be the same GSP as e-Way Bill,
        but usually different endpoints. Stored securely and never shown again once saved.
      </p>

      {status ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          Configured: <span className="font-medium">{status.gsp_provider}</span> · last updated{" "}
          {formatDateTime(status.updated_at)}
        </p>
      ) : (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          No e-Invoicing provider configured yet — invoices above the e-invoicing threshold
          cannot be legally issued until this is set up.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-provider">GSP provider name</Label>
          <Input
            id="einv-provider"
            name="gsp_provider"
            required
            defaultValue={status?.gsp_provider ?? ""}
            placeholder="e.g. ClearTax, MasterGST"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-auth-url">Auth URL</Label>
          <Input id="einv-auth-url" name="auth_url" type="url" required placeholder="https://…/authenticate" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-generate-url">Generate URL</Label>
          <Input
            id="einv-generate-url"
            name="generate_url"
            type="url"
            required
            placeholder="https://…/eicore/v1.03/Invoice"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-cancel-url">Cancel URL</Label>
          <Input
            id="einv-cancel-url"
            name="cancel_url"
            type="url"
            required
            placeholder="https://…/eicore/v1.03/Invoice/Cancel"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-status-url">Status URL (optional)</Label>
          <Input
            id="einv-status-url"
            name="status_url"
            type="url"
            placeholder="https://…/eicore/v1.03/Invoice/irn"
          />
          <p className="text-xs text-muted-foreground">Lets WonderArc look up an IRN&apos;s current status. Leave blank if your GSP doesn&apos;t expose this separately.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="einv-fetch-url">Fetch URL (optional)</Label>
          <Input
            id="einv-fetch-url"
            name="fetch_url"
            type="url"
            placeholder="https://…/eicore/v1.03/Invoice/irn"
          />
          <p className="text-xs text-muted-foreground">Lets WonderArc retrieve the full invoice details the IRP holds for an IRN.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="einv-username">GSP username</Label>
            <Input id="einv-username" name="gsp_username" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="einv-password">GSP password</Label>
            <Input id="einv-password" name="gsp_password" type="password" autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="einv-client-id">Client ID</Label>
            <Input id="einv-client-id" name="client_id" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="einv-client-secret">Client secret</Label>
            <Input id="einv-client-secret" name="client_secret" type="password" autoComplete="new-password" />
          </div>
        </div>

        {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state && "success" in state ? <p className="text-sm text-primary">Saved.</p> : null}

        <SubmitButton pendingText="Saving...">
          {status ? "Update credentials" : "Save credentials"}
        </SubmitButton>
      </form>
    </div>
  );
}
