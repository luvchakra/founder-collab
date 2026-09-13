"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import type { ComplianceCountry, CompliancePack } from "@cofounderai/core/admin/platform-compliance";
import { createCompliancePackAction, updateCompliancePackAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-13.2 ("Compliance Pack Availability") -- one dialog for both Add and Edit,
 * mirroring `plan-dialog.tsx`/`country-dialog.tsx`. `pack` is undefined for Add; when
 * present, country and regime become read-only (immutable after creation -- together
 * they're the identity `platform.compliance_pack_features.pack_id` rows hang off of).
 */
export function PackDialog({ pack, countries }: { pack?: CompliancePack; countries: ComplianceCountry[] }) {
  const isEdit = Boolean(pack);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const common = {
      displayName: String(formData.get("displayName") ?? ""),
      enabled: formData.get("enabled") === "on",
      version: String(formData.get("version") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    };
    startTransition(async () => {
      const result = isEdit
        ? await updateCompliancePackAction(pack!.id, common)
        : await createCompliancePackAction({
            ...common,
            countryCode: String(formData.get("countryCode") ?? ""),
            regime: String(formData.get("regime") ?? ""),
          });
      if (!result.ok) {
        setFieldErrors("fieldErrors" in result ? result.fieldErrors : {});
        if (!("fieldErrors" in result)) toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(isEdit ? "Compliance pack updated." : "Compliance pack added.");
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
            Add pack
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${pack!.displayName}` : "Add a compliance pack"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="countryCode" className={LABEL_CLASS}>
                Country
              </Label>
              {isEdit ? (
                <Input
                  id="countryCode"
                  value={countries.find((c) => c.countryCode === pack!.countryCode)?.name ?? pack!.countryCode}
                  disabled
                  className={FIELD_CLASS}
                />
              ) : (
                <NativeSelect id="countryCode" name="countryCode" className={FIELD_CLASS} defaultValue={countries[0]?.countryCode}>
                  {countries.map((c) => (
                    <option key={c.countryCode} value={c.countryCode}>
                      {c.name} ({c.countryCode})
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="regime" className={LABEL_CLASS}>
                Regime
              </Label>
              {isEdit ? (
                <Input id="regime" value={pack!.regime} disabled className={FIELD_CLASS} />
              ) : (
                <Input
                  id="regime"
                  name="regime"
                  placeholder="GST"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.regime)}
                />
              )}
              {fieldErrors.regime ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.regime}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="displayName" className={LABEL_CLASS}>
              Display name
            </Label>
            <Input
              id="displayName"
              name="displayName"
              defaultValue={pack?.displayName}
              placeholder="GST (Goods & Services Tax)"
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.displayName)}
            />
            {fieldErrors.displayName ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.displayName}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="version" className={LABEL_CLASS}>
              Version (optional)
            </Label>
            <Input id="version" name="version" defaultValue={pack?.version ?? ""} className={FIELD_CLASS} />
            {fieldErrors.version ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.version}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes" className={LABEL_CLASS}>
              Notes (optional)
            </Label>
            <Textarea id="notes" name="notes" defaultValue={pack?.notes ?? ""} className={FIELD_CLASS} rows={2} />
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="enabled" defaultChecked={pack?.enabled ?? false} />
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Add pack"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
