"use client";

import { useActionState } from "react";
import { Label } from "@cofounderai/core/ui/label";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { INDIAN_STATES } from "@cofounderai/core/lib/gst";
import type { GstProfile } from "../../lib/profile/types";

export type GstProfileActionState = { error: string } | { success: true } | null;

/**
 * GST registration card -- ported from stockpilot-ai-ops's account.tsx "GST profile"
 * card. Inline form (not the list+dialog pattern the module-inventory CRUD pages use):
 * upstream never had this as a dialog either, it's a single always-visible settings
 * form, same as this platform's own licenses settings page.
 */
export function GstProfileForm({
  profile,
  canEdit,
  action,
}: {
  profile: GstProfile | null;
  canEdit: boolean;
  action: (prevState: GstProfileActionState, formData: FormData) => Promise<GstProfileActionState>;
}) {
  const [state, formAction] = useActionState<GstProfileActionState, FormData>(action, null);
  const gstType = profile?.gst_registration_type ?? "regular";

  if (!canEdit) {
    return (
      <div className="max-w-lg space-y-1 rounded-2xl border border-border p-4 text-sm">
        <p>
          <span className="text-muted-foreground">GSTIN:</span> {profile?.gstin ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">State:</span> {profile?.state ?? "—"}
        </p>
        <p>
          <span className="text-muted-foreground">Registration type:</span> {gstType}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      {!profile?.gstin && gstType !== "unregistered" ? (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          No GSTIN on file yet — purchase orders can&apos;t split CGST/SGST vs. IGST correctly
          until your business&apos;s GSTIN and state are set.
        </p>
      ) : null}

      <form action={formAction} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="gst-type">GST registration type</Label>
          <NativeSelect id="gst-type" name="gst_registration_type" defaultValue={gstType}>
            <option value="regular">Regular</option>
            <option value="composition">Composition scheme</option>
            <option value="unregistered">Unregistered</option>
          </NativeSelect>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gst-gstin">GSTIN</Label>
            <Input
              id="gst-gstin"
              name="gstin"
              defaultValue={profile?.gstin ?? ""}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="uppercase"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gst-state">State (for GST place of supply)</Label>
            <NativeSelect id="gst-state" name="state" defaultValue={profile?.state ?? ""}>
              <option value="">Select state</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.name}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state && "success" in state ? <p className="text-sm text-primary">Saved.</p> : null}

        <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
      </form>
    </div>
  );
}
