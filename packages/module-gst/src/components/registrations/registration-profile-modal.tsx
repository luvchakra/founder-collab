"use client";

import { useActionState, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { parseGstRegistrationProfile } from "../../lib/tax-registrations/gst-registration-profile";
import type { TaxRegistration } from "../../lib/tax-registrations/types";

export type GstRegistrationProfileActionState = { error: string } | { success: true } | null;

/**
 * COMPLY-P0-04.2 (GST Profile): edits one registration's own India-GST attributes --
 * registration type, registration date, return frequency, e-invoice eligibility. Always
 * an edit, never a create -- these fields only ever exist once a GSTIN has already been
 * added via `RegistrationModal` (COMPLY-P0-04.1), so every field here is pre-filled from
 * the registration's own current values (defaulted by `parseGstRegistrationProfile` when
 * nothing has been set yet), never blank.
 */
export function RegistrationProfileModal({
  registration,
  action,
  onClose,
}: {
  registration: TaxRegistration;
  action: (
    prevState: GstRegistrationProfileActionState,
    formData: FormData,
  ) => Promise<GstRegistrationProfileActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<GstRegistrationProfileActionState, FormData>(action, null);
  const [mounted, setMounted] = useState(false);
  const profile = parseGstRegistrationProfile(registration.metadata);

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
        aria-labelledby="registration-profile-modal-title"
        className={`relative w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
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

        <h2 id="registration-profile-modal-title" className="text-lg font-semibold">
          GST profile -- {registration.registration_number}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-profile-type">Registration type</Label>
            <NativeSelect id="reg-profile-type" name="registration_type" defaultValue={profile.registrationType}>
              <option value="regular">Regular</option>
              <option value="composition">Composition scheme</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-profile-date">Registration date</Label>
            <Input
              id="reg-profile-date"
              name="registered_from"
              type="date"
              defaultValue={registration.registered_from ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-profile-frequency">Return filing frequency</Label>
            <NativeSelect id="reg-profile-frequency" name="return_frequency" defaultValue={profile.returnFrequency}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="e_invoice_eligible" defaultChecked={profile.eInvoiceEligible} />
              This registration is required to issue e-invoices
            </label>
            <p className="text-xs text-muted-foreground">
              Self-declared -- WonderArc doesn&apos;t check this against your turnover automatically
              yet. Used by e-invoicing to decide when a document needs an IRN.
            </p>
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Saving...">Save profile</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
