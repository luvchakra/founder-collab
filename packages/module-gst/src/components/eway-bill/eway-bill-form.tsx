"use client";

import { useActionState } from "react";
import { Label } from "@cofounderai/core/ui/label";
import { Input } from "@cofounderai/core/ui/input";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { EwayBillCredentialsStatus } from "../../lib/eway-bill/types";

export type EwayBillActionState = { error: string } | { success: true } | null;

/**
 * e-Way Bill (GST compliance) credentials form -- ported from stockpilot-ai-ops's
 * account.tsx "e-Way Bill (GST compliance)" card. Write-only: none of the 8 fields are
 * ever pre-filled from a previous save except `gsp_provider` (the original's own
 * behavior -- its status RPC returns auth_url/generate_url/cancel_url too, but the
 * original never wired them back into the form either; kept faithfully rather than
 * "fixed" without being asked). The secret fields (password/client secret) and the
 * lower-sensitivity-but-still-never-returned ones (username/client id) start blank on
 * every render, always -- there is nothing to read them back from (no SELECT grant).
 */
export function EwayBillForm({
  status,
  canEdit,
  action,
}: {
  status: EwayBillCredentialsStatus | null;
  canEdit: boolean;
  action: (prevState: EwayBillActionState, formData: FormData) => Promise<EwayBillActionState>;
}) {
  const [state, formAction] = useActionState<EwayBillActionState, FormData>(action, null);

  if (!canEdit) {
    return (
      <p className="max-w-lg text-sm text-muted-foreground">
        {status
          ? `Configured: ${status.gsp_provider} · last updated ${formatDateTime(status.updated_at)}`
          : "No e-Way Bill provider configured yet."}
      </p>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <p className="text-xs text-muted-foreground">
        e-Way Bill generation goes through your GST Suvidha Provider (GSP) — e.g. ClearTax,
        MasterGST, Vayana, Whitebooks. Enter the base URLs and credentials your GSP issued you.
        These are stored securely and are never shown again once saved — to change them, re-enter
        and save fresh values.
      </p>

      {status ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
          Configured: <span className="font-medium">{status.gsp_provider}</span> · last updated{" "}
          {formatDateTime(status.updated_at)}
        </p>
      ) : (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          No e-Way Bill provider configured yet — e-Way Bill generation will be unavailable on
          sales orders, invoices, and purchase orders until this is set up.
        </p>
      )}

      <form action={formAction} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ewb-provider">GSP provider name</Label>
          <Input
            id="ewb-provider"
            name="gsp_provider"
            required
            defaultValue={status?.gsp_provider ?? ""}
            placeholder="e.g. ClearTax, MasterGST"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ewb-auth-url">Auth URL</Label>
          <Input id="ewb-auth-url" name="auth_url" type="url" required placeholder="https://…/authenticate" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ewb-generate-url">Generate URL</Label>
          <Input id="ewb-generate-url" name="generate_url" type="url" required placeholder="https://…/ewayapi" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ewb-cancel-url">Cancel URL</Label>
          <Input id="ewb-cancel-url" name="cancel_url" type="url" required placeholder="https://…/ewayapi/cancel" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ewb-username">GSP username</Label>
            <Input id="ewb-username" name="gsp_username" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ewb-password">GSP password</Label>
            <Input id="ewb-password" name="gsp_password" type="password" autoComplete="new-password" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ewb-client-id">Client ID</Label>
            <Input id="ewb-client-id" name="client_id" autoComplete="off" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ewb-client-secret">Client secret</Label>
            <Input id="ewb-client-secret" name="client_secret" type="password" autoComplete="new-password" />
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
