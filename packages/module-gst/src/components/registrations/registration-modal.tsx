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

/** India/GST keeps its own well-known terms ("GSTIN", "state"); every other
 * country/regime this module now supports (US sales tax, Canada GST/HST, EU VAT --
 * `countries.ts`'s own catalog) uses the generic terms instead, since there's no single
 * universal name for "the registration number" or "the sub-national jurisdiction" across
 * all of them. */
function registrationNumberLabel(country: string, regime: string): { label: string; placeholder: string } {
  if (country === "IN" && regime === "GST") return { label: "GSTIN", placeholder: "22AAAAA0000A1Z5" };
  return { label: "Registration number", placeholder: "" };
}

/**
 * COMPLY-P0-04.1 (GSTIN Management): "add a registration" form -- create-only, no edit. A
 * registration's own identity (its number, which jurisdiction it's registered in) never
 * changes once issued; if one was entered wrong the fix is cancelling it and adding the
 * correct one (`gst.tax_registrations` has no update path for those fields either, only
 * `setPrimaryTaxRegistration`/`setTaxRegistrationStatus` -- see that file's own
 * docstring), so this modal never opens in an "edit" mode the way
 * `WarehouseModal`-shaped create/edit forms elsewhere in the platform do.
 *
 * Country/regime-aware since the P1 country packs (US/Canada/EU VAT -- `countries.ts`'s
 * own catalog) added real, working jurisdiction and tax-registration support of their
 * own: the jurisdiction picker reads whichever country the business's Compliance profile
 * is actually in (`getJurisdictions(country)`), not a hard-coded "IN", and disappears
 * entirely for a country with no sub-national jurisdiction concept (the five EU VAT
 * countries -- VAT registration is national, not per-state) rather than showing an empty
 * "Select state" dropdown with nothing to pick.
 */
export function RegistrationModal({
  country,
  regime,
  regimeName,
  action,
  onClose,
}: {
  country: string;
  regime: string;
  /** The regime's own human-readable name from `countries.ts`'s catalog (e.g. "VAT",
   * "GST/HST") -- passed in rather than re-derived here since the caller already looked
   * it up to render the page's own title/copy. */
  regimeName: string;
  action: (prevState: TaxRegistrationActionState, formData: FormData) => Promise<TaxRegistrationActionState>;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<TaxRegistrationActionState, FormData>(action, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const jurisdictions = getJurisdictions(country);
  const numberField = registrationNumberLabel(country, regime);

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
          Add a {regimeName} registration
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {jurisdictions.length > 0
            ? `One ${numberField.label} per ${jurisdictions[0]!.level} you're registered in. This becomes the effective one other Compliance/Inventory/Service documents use once it's set as primary.`
            : `This becomes the effective ${numberField.label.toLowerCase()} other Compliance/Inventory/Service documents use once it's set as primary.`}
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="country" value={country} />
          <input type="hidden" name="regime" value={regime} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-number">{numberField.label}</Label>
            <Input
              ref={inputRef}
              id="reg-number"
              name="registration_number"
              required
              placeholder={numberField.placeholder || undefined}
              maxLength={numberField.label === "GSTIN" ? 15 : undefined}
              className="uppercase"
            />
          </div>
          {jurisdictions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reg-jurisdiction" className="capitalize">
                {jurisdictions[0]!.level}
              </Label>
              <NativeSelect id="reg-jurisdiction" name="jurisdiction" required defaultValue="">
                <option value="" disabled>
                  Select {jurisdictions[0]!.level}
                </option>
                {jurisdictions.map((j) => (
                  <option key={j.name} value={j.name}>
                    {j.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="is_primary" defaultChecked />
            Set as primary {numberField.label.toLowerCase()} for this business
          </label>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText="Adding...">Add {numberField.label}</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
