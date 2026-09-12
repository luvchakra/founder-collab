"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { FeatureFlag, FeatureFlagScopeType } from "@cofounderai/core/admin/platform-feature-flags";
import { createFeatureFlagAction, updateFeatureFlagAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses -- the vendored
// components' defaults resolve against the site's light-theme tokens, which `/platform`
// never opts into.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

const SCOPE_LABELS: Record<FeatureFlagScopeType, string> = {
  global: "Global",
  plan: "Plan",
  module: "Module",
  country: "Country",
};

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm", not a full ISO string --
 * this trims a stored ISO value down to that shape for the input's own `defaultValue`. */
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

/**
 * PLATFORM-P0-08.1/08.2/08.4 -- one dialog for both Add and Edit (matches
 * `plan-dialog.tsx`'s established pattern). `flag` is undefined for Add. Scope
 * (`scopeType` and its target) is immutable after creation (see the migration's own
 * docstring) -- shown as read-only text in Edit mode, not a second set of editable
 * controls. A reason is required for every submission, create or edit alike, matching
 * §12.4's "every change" audit requirement -- the confirm button stays disabled until it's
 * non-empty.
 */
export function FeatureFlagDialog({
  flag,
  scopeOptions,
}: {
  flag?: FeatureFlag;
  scopeOptions: { plans: { id: string; name: string }[]; modules: { key: string; name: string }[] };
}) {
  const isEdit = Boolean(flag);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [scopeType, setScopeType] = useState<FeatureFlagScopeType>(flag?.scopeType ?? "global");
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
    setScopeType(flag?.scopeType ?? "global");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = isEdit
        ? await updateFeatureFlagAction({
            id: flag!.id,
            description: String(formData.get("description") ?? ""),
            enabled: formData.get("enabled") === "on",
            effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
            effectiveTo: String(formData.get("effectiveTo") ?? ""),
            reason,
          })
        : await createFeatureFlagAction({
            featureKey: String(formData.get("featureKey") ?? ""),
            description: String(formData.get("description") ?? ""),
            enabled: formData.get("enabled") === "on",
            effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
            effectiveTo: String(formData.get("effectiveTo") ?? ""),
            scopeType,
            scopePlanId: String(formData.get("scopePlanId") ?? ""),
            scopeModuleKey: String(formData.get("scopeModuleKey") ?? ""),
            scopeCountryCode: String(formData.get("scopeCountryCode") ?? ""),
            reason,
          });
      if (!result.ok) {
        setFieldErrors("fieldErrors" in result ? result.fieldErrors ?? {} : {});
        if ("error" in result) toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(isEdit ? "Feature flag updated." : "Feature flag created.");
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New flag
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit "${flag!.featureKey}"` : "New feature flag"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isEdit
              ? "Scope is permanent once created. Every change here is recorded with your reason."
              : "An operational on/off control -- for reliability, staged rollout, or emergency kill switches. Distinct from a plan's own commercial entitlements."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="featureKey" className={LABEL_CLASS}>
              Feature key
            </Label>
            {isEdit ? (
              <Input id="featureKey" value={flag!.featureKey} disabled className={FIELD_CLASS} />
            ) : (
              <Input
                id="featureKey"
                name="featureKey"
                placeholder="ai_research"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.featureKey)}
              />
            )}
            {fieldErrors.featureKey ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.featureKey}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">Permanent once created.</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description" className={LABEL_CLASS}>
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={flag?.description ?? ""}
              className={FIELD_CLASS}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className={LABEL_CLASS}>Scope</Label>
            {isEdit ? (
              <p className="text-sm text-zinc-300">
                {SCOPE_LABELS[flag!.scopeType]}
                {flag!.scopePlan ? ` -- ${flag!.scopePlan.name}` : null}
                {flag!.scopeModule ? ` -- ${flag!.scopeModule.name}` : null}
                {flag!.scopeCountryCode ? ` -- ${flag!.scopeCountryCode}` : null}
              </p>
            ) : (
              <>
                <NativeSelect
                  value={scopeType}
                  onChange={(e) => setScopeType(e.target.value as FeatureFlagScopeType)}
                  className={FIELD_CLASS}
                >
                  {(Object.keys(SCOPE_LABELS) as FeatureFlagScopeType[]).map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
                {scopeType === "plan" ? (
                  <NativeSelect
                    name="scopePlanId"
                    className={`${FIELD_CLASS} mt-2`}
                    defaultValue={scopeOptions.plans[0]?.id}
                    aria-invalid={Boolean(fieldErrors.scopePlanId)}
                  >
                    {scopeOptions.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
                {scopeType === "module" ? (
                  <NativeSelect
                    name="scopeModuleKey"
                    className={`${FIELD_CLASS} mt-2`}
                    defaultValue={scopeOptions.modules[0]?.key}
                    aria-invalid={Boolean(fieldErrors.scopeModuleKey)}
                  >
                    {scopeOptions.modules.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
                {scopeType === "country" ? (
                  <Input
                    name="scopeCountryCode"
                    placeholder="IN"
                    maxLength={2}
                    className={`${FIELD_CLASS} mt-2`}
                    aria-invalid={Boolean(fieldErrors.scopeCountryCode)}
                  />
                ) : null}
                {fieldErrors.scopePlanId || fieldErrors.scopeModuleKey || fieldErrors.scopeCountryCode ? (
                  <p role="alert" className="text-xs text-red-400">
                    {fieldErrors.scopePlanId || fieldErrors.scopeModuleKey || fieldErrors.scopeCountryCode}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effectiveFrom" className={LABEL_CLASS}>
                Effective from (optional)
              </Label>
              <Input
                id="effectiveFrom"
                name="effectiveFrom"
                type="datetime-local"
                defaultValue={toDateTimeLocal(flag?.effectiveFrom ?? null)}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.effectiveFrom)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="effectiveTo" className={LABEL_CLASS}>
                Effective to (optional)
              </Label>
              <Input
                id="effectiveTo"
                name="effectiveTo"
                type="datetime-local"
                defaultValue={toDateTimeLocal(flag?.effectiveTo ?? null)}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.effectiveTo)}
              />
            </div>
          </div>
          {fieldErrors.effectiveTo ? (
            <p role="alert" className="text-xs text-red-400">
              {fieldErrors.effectiveTo}
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="enabled" defaultChecked={flag?.enabled ?? true} />
            Enabled
          </label>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Registering this flag ahead of next week's rollout"
              className={FIELD_CLASS}
              rows={2}
            />
            <p className="text-xs text-zinc-500">Every change to a feature flag is recorded with this reason.</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => resetOnOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create flag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
