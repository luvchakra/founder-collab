"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import type { ComplianceCountry } from "@cofounderai/core/admin/platform-compliance";
import { createComplianceCountryAction, updateComplianceCountryAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses (see
// branding-form.tsx's own note) -- the vendored components' defaults resolve against the
// site's light-theme tokens, which `/platform` never opts into.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-13.1 ("Country Registry") -- one dialog for both Add and Edit, mirroring
 * `plan-dialog.tsx`'s established pattern exactly (a dialog rather than a separate page,
 * per docs/design/claude-ui-design-rules.md rule 4). `country` is undefined for Add; when
 * present every field pre-fills and the country code becomes read-only (immutable after
 * creation -- see `updateComplianceCountrySchema`'s own docstring).
 */
export function CountryDialog({ country }: { country?: ComplianceCountry }) {
  const isEdit = Boolean(country);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input = {
      countryCode: String(formData.get("countryCode") ?? ""),
      name: String(formData.get("name") ?? ""),
      enabled: formData.get("enabled") === "on",
      notes: String(formData.get("notes") ?? ""),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateComplianceCountryAction(country!.countryCode, input)
        : await createComplianceCountryAction(input);
      if (!result.ok) {
        setFieldErrors("fieldErrors" in result ? result.fieldErrors : {});
        if (!("fieldErrors" in result)) toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(isEdit ? "Country updated." : "Country added.");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFieldErrors({});
      }}
    >
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Add country
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${country!.name}` : "Add a country"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="countryCode" className={LABEL_CLASS}>
                ISO code
              </Label>
              {isEdit ? (
                <Input id="countryCode" value={country!.countryCode} disabled className={FIELD_CLASS} />
              ) : (
                <Input
                  id="countryCode"
                  name="countryCode"
                  placeholder="IN"
                  maxLength={2}
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.countryCode)}
                />
              )}
              {fieldErrors.countryCode ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.countryCode}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">Permanent once created.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name" className={LABEL_CLASS}>
                Name
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={country?.name}
                placeholder="India"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.name}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className={LABEL_CLASS}>
              Notes (optional)
            </Label>
            <Textarea id="notes" name="notes" defaultValue={country?.notes ?? ""} className={FIELD_CLASS} rows={2} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="enabled" defaultChecked={country?.enabled ?? false} />
            Offered platform-wide
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add country"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
