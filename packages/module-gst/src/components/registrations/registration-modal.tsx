"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { getJurisdictions } from "../../lib/compliance/jurisdictions";

export type TaxRegistrationActionState = { error: string } | { success: true } | null;

/**
 * COMPLY-P0-04.1 (GSTIN Management): "add a GSTIN" form -- create-only, no edit. A
 * registration's own identity (its number, which state it's registered in) never
 * changes once issued; if one was entered wrong the fix is cancelling it and adding the
 * correct one (`gst.tax_registrations` has no update path for those fields either, only
 * `setPrimaryTaxRegistration`/`setTaxRegistrationStatus` -- see that file's own
 * docstring), so this modal never opens in an "edit" mode the way
 * `WarehouseModal`-shaped create/edit forms elsewhere in the platform do.
 *
 * India-only for now (this page only ever calls it with country="IN"/regime="GST" --
 * COMPLY-P0-04's own epic scope), so the jurisdiction picker is hard-coded to
 * `getJurisdictions("IN")` rather than taking a country prop nobody would vary yet
 * (backlog rule 4: don't build for a P1 country pack this run hasn't reached).
 */
export function RegistrationModal({
  action,
  onClose,
}: {
  action: (prevState: TaxRegistrationActionState, formData: FormData) => Promise<TaxRegistrationActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<TaxRegistrationActionState, FormData>(action, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const jurisdictions = getJurisdictions("IN");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    inputRef.current?.focus();

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
        aria-labelledby="registration-modal-title"
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

        <h2 id="registration-modal-title" className="text-lg font-semibold">
          Add a GST registration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One GSTIN per state you&apos;re registered in. This becomes the effective GSTIN other
          Compliance/Inventory/Service documents use once it&apos;s set as primary.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-gstin">GSTIN</Label>
            <Input
              ref={inputRef}
              id="reg-gstin"
              name="registration_number"
              required
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              className="uppercase"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-jurisdiction">State</Label>
            <NativeSelect id="reg-jurisdiction" name="jurisdiction" required defaultValue="">
              <option value="" disabled>
                Select state
              </option>
              {jurisdictions.map((j) => (
                <option key={j.name} value={j.name}>
                  {j.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="is_primary" defaultChecked />
            Set as primary GSTIN for this business
          </label>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Adding...">Add GSTIN</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
