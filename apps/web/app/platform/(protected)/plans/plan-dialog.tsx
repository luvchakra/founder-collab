"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import type { PlatformPlan } from "@cofounderai/core/admin/platform-plans";
import { createPlanAction, updatePlanAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses (see
// branding-form.tsx's own note) -- the vendored components' defaults resolve against the
// site's light-theme tokens, which `/platform` never opts into.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-04.1 ("Plan Management"): one dialog component for both Add and Edit,
 * matching `edit-value-dialog.tsx`'s established pattern (a dialog rather than a separate
 * page, per docs/design/claude-ui-design-rules.md rule 4 -- "do not force users to
 * navigate to another page merely to perform a simple edit"). `plan` is undefined for
 * Add; when present, every field pre-fills from it and `key` becomes read-only (a plan's
 * key is immutable after creation -- see `updatePlatformPlanSchema`'s own docstring).
 *
 * Submits via a plain `onSubmit` + `useTransition`, not `useActionState` +
 * `<form action=...>`: closing the dialog only on success (never on a field-error result)
 * needs a branch on the action's return value at the exact moment it resolves, and doing
 * that from a `useActionState` result via a `useEffect` trips this repo's
 * `react-hooks/set-state-in-effect` lint rule (calling `setOpen` synchronously inside an
 * effect body) -- avoided entirely by handling the result inline in the submit handler
 * instead, the same shape `publish-controls.tsx` already uses successfully.
 */
export function PlanDialog({ plan }: { plan?: PlatformPlan }) {
  const isEdit = Boolean(plan);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = isEdit ? await updatePlanAction(plan!.id, null, formData) : await createPlanAction(null, formData);
      if (result?.status === "error") {
        setFieldErrors(result.fieldErrors);
        setFormError(result.formError);
        return;
      }
      setFieldErrors({});
      setFormError(undefined);
      toast.success(isEdit ? "Plan updated." : "Plan created.");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFieldErrors({});
          setFormError(undefined);
        }
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
            Add plan
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${plan!.name}` : "Add a plan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key" className={LABEL_CLASS}>
                Key
              </Label>
              {isEdit ? (
                <Input id="key" value={plan!.key} disabled className={FIELD_CLASS} />
              ) : (
                <Input
                  id="key"
                  name="key"
                  placeholder="growth"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.key)}
                />
              )}
              {fieldErrors.key ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.key}
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
                defaultValue={plan?.name}
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
            <Label htmlFor="description" className={LABEL_CLASS}>
              Description
            </Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={plan?.description ?? ""}
              className={FIELD_CLASS}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price" className={LABEL_CLASS}>
                Price
              </Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={plan?.price ?? 0}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.price)}
              />
              {fieldErrors.price ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.price}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency" className={LABEL_CLASS}>
                Currency
              </Label>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={plan?.currency ?? "INR"}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.currency)}
              />
              {fieldErrors.currency ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.currency}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingInterval" className={LABEL_CLASS}>
                Billing interval
              </Label>
              <NativeSelect
                id="billingInterval"
                name="billingInterval"
                defaultValue={plan?.billingInterval ?? "month"}
                className={FIELD_CLASS}
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </NativeSelect>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status" className={LABEL_CLASS}>
                Status
              </Label>
              <NativeSelect id="status" name="status" defaultValue={plan?.status ?? "draft"} className={FIELD_CLASS}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="deprecated">Deprecated</option>
                <option value="archived">Archived</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="displayOrder" className={LABEL_CLASS}>
                Display order
              </Label>
              <Input
                id="displayOrder"
                name="displayOrder"
                type="number"
                step="1"
                defaultValue={plan?.displayOrder ?? 0}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.displayOrder)}
              />
              {fieldErrors.displayOrder ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.displayOrder}
                </p>
              ) : null}
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <Checkbox name="marketingVisible" defaultChecked={plan?.marketingVisible ?? true} />
                Marketing visible
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              name="reason"
              placeholder="e.g. Raising Pro's price for new subscribers"
              className={FIELD_CLASS}
              rows={2}
              aria-invalid={Boolean(fieldErrors.reason)}
            />
            {fieldErrors.reason ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.reason}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Every plan change is recorded -- PLATFORM-P0-17.1 Configuration Versioning.
              </p>
            )}
          </div>

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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
