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
import type {
  Announcement,
  AnnouncementAudienceType,
  AnnouncementType,
} from "@cofounderai/core/admin/platform-announcements";
import { createAnnouncementAction, updateAnnouncementAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses -- the vendored
// components' defaults resolve against the site's light-theme tokens, which `/platform`
// never opts into.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

const TYPE_LABELS: Record<AnnouncementType, string> = {
  information: "Information",
  warning: "Warning",
  maintenance: "Maintenance",
  critical: "Critical",
};

const AUDIENCE_LABELS: Record<AnnouncementAudienceType, string> = {
  all_customers: "All customers",
  all_users: "All users",
  specific_plan: "Specific plan",
  specific_country: "Specific country",
};

/** `<input type="datetime-local">` wants "YYYY-MM-DDTHH:mm", not a full ISO string --
 * mirrors `feature-flag-dialog.tsx`'s own identical helper. */
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export type AnnouncementFormOptions = {
  plans: { id: string; name: string }[];
  countryCodes: string[];
  modules: { key: string; name: string }[];
};

/**
 * PLATFORM-P0-15.1/15.2/15.3/15.4 -- one dialog for both Add and Edit (matches
 * `FeatureFlagDialog`'s established pattern). `announcement` is undefined for Add.
 * `type`/`audienceType`/its target are immutable after creation (see the migration's own
 * docstring) -- shown as read-only text in Edit mode. Maintenance-only fields
 * (maintenance window, affected modules) only render when `type === "maintenance"`. A
 * reason is required for every submission, create or edit alike -- the confirm button
 * stays disabled until it's non-empty.
 */
export function AnnouncementDialog({
  announcement,
  options,
}: {
  announcement?: Announcement;
  options: AnnouncementFormOptions;
}) {
  const isEdit = Boolean(announcement);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [type, setType] = useState<AnnouncementType>(announcement?.type ?? "information");
  const [audienceType, setAudienceType] = useState<AnnouncementAudienceType>(
    announcement?.audienceType ?? "all_customers",
  );
  const [affectedModules, setAffectedModules] = useState<string[]>(announcement?.affectedModules ?? []);
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
    setType(announcement?.type ?? "information");
    setAudienceType(announcement?.audienceType ?? "all_customers");
    setAffectedModules(announcement?.affectedModules ?? []);
  }

  function toggleModule(key: string, checked: boolean) {
    setAffectedModules((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const shared = {
      type,
      title: String(formData.get("title") ?? ""),
      message: String(formData.get("message") ?? ""),
      publishAt: String(formData.get("publishAt") ?? ""),
      expireAt: String(formData.get("expireAt") ?? ""),
      maintenanceStart: String(formData.get("maintenanceStart") ?? ""),
      maintenanceEnd: String(formData.get("maintenanceEnd") ?? ""),
      affectedModules: affectedModules.join(","),
      enabled: formData.get("enabled") === "on",
      reason,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateAnnouncementAction({ id: announcement!.id, ...shared })
        : await createAnnouncementAction({
            ...shared,
            audienceType,
            audiencePlanId: String(formData.get("audiencePlanId") ?? ""),
            audienceCountryCode: String(formData.get("audienceCountryCode") ?? ""),
          });
      if (!result.ok) {
        setFieldErrors("fieldErrors" in result ? (result.fieldErrors ?? {}) : {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(isEdit ? "Announcement updated." : "Announcement created.");
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
            New announcement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit "${announcement!.title}"` : "New announcement"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isEdit
              ? "Type and audience are permanent once created. Every change here is recorded with your reason."
              : "A platform-wide banner or notice. No email or in-app delivery is wired up yet -- this only records the catalog entry."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Type</Label>
              {isEdit ? (
                <p className="text-sm text-zinc-300">{TYPE_LABELS[type]}</p>
              ) : (
                <NativeSelect
                  value={type}
                  onChange={(e) => setType(e.target.value as AnnouncementType)}
                  className={FIELD_CLASS}
                >
                  {(Object.keys(TYPE_LABELS) as AnnouncementType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Audience</Label>
              {isEdit ? (
                <p className="text-sm text-zinc-300">
                  {AUDIENCE_LABELS[announcement!.audienceType]}
                  {announcement!.audiencePlan ? ` -- ${announcement!.audiencePlan.name}` : null}
                  {announcement!.audienceCountryCode ? ` -- ${announcement!.audienceCountryCode}` : null}
                </p>
              ) : (
                <NativeSelect
                  value={audienceType}
                  onChange={(e) => setAudienceType(e.target.value as AnnouncementAudienceType)}
                  className={FIELD_CLASS}
                >
                  {(Object.keys(AUDIENCE_LABELS) as AnnouncementAudienceType[]).map((a) => (
                    <option key={a} value={a}>
                      {AUDIENCE_LABELS[a]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </div>
          </div>

          {!isEdit && audienceType === "specific_plan" ? (
            <div className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Plan</Label>
              <NativeSelect
                name="audiencePlanId"
                className={FIELD_CLASS}
                defaultValue={options.plans[0]?.id}
                aria-invalid={Boolean(fieldErrors.audiencePlanId)}
              >
                {options.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
              {fieldErrors.audiencePlanId ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.audiencePlanId}
                </p>
              ) : null}
            </div>
          ) : null}

          {!isEdit && audienceType === "specific_country" ? (
            <div className="flex flex-col gap-1.5">
              <Label className={LABEL_CLASS}>Country</Label>
              <NativeSelect
                name="audienceCountryCode"
                className={FIELD_CLASS}
                defaultValue={options.countryCodes[0]}
                aria-invalid={Boolean(fieldErrors.audienceCountryCode)}
              >
                {options.countryCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
              {fieldErrors.audienceCountryCode ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.audienceCountryCode}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title" className={LABEL_CLASS}>
              Title
            </Label>
            <Input
              id="title"
              name="title"
              defaultValue={announcement?.title ?? ""}
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.title)}
            />
            {fieldErrors.title ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message" className={LABEL_CLASS}>
              Message
            </Label>
            <Textarea
              id="message"
              name="message"
              defaultValue={announcement?.message ?? ""}
              className={FIELD_CLASS}
              rows={3}
              aria-invalid={Boolean(fieldErrors.message)}
            />
            {fieldErrors.message ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.message}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publishAt" className={LABEL_CLASS}>
                Publish at (optional)
              </Label>
              <Input
                id="publishAt"
                name="publishAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(announcement?.publishAt ?? null)}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.publishAt)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expireAt" className={LABEL_CLASS}>
                Expire at (optional)
              </Label>
              <Input
                id="expireAt"
                name="expireAt"
                type="datetime-local"
                defaultValue={toDateTimeLocal(announcement?.expireAt ?? null)}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.expireAt)}
              />
            </div>
          </div>
          {fieldErrors.expireAt ? (
            <p role="alert" className="text-xs text-red-400">
              {fieldErrors.expireAt}
            </p>
          ) : null}

          {type === "maintenance" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3">
              <p className="text-xs font-medium text-zinc-400">Maintenance window</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maintenanceStart" className={LABEL_CLASS}>
                    Start
                  </Label>
                  <Input
                    id="maintenanceStart"
                    name="maintenanceStart"
                    type="datetime-local"
                    defaultValue={toDateTimeLocal(announcement?.maintenanceStart ?? null)}
                    className={FIELD_CLASS}
                    aria-invalid={Boolean(fieldErrors.maintenanceStart)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maintenanceEnd" className={LABEL_CLASS}>
                    End
                  </Label>
                  <Input
                    id="maintenanceEnd"
                    name="maintenanceEnd"
                    type="datetime-local"
                    defaultValue={toDateTimeLocal(announcement?.maintenanceEnd ?? null)}
                    className={FIELD_CLASS}
                    aria-invalid={Boolean(fieldErrors.maintenanceEnd)}
                  />
                </div>
              </div>
              {fieldErrors.maintenanceEnd ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.maintenanceEnd}
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <Label className={LABEL_CLASS}>Affected modules</Label>
                <div className="flex flex-wrap gap-3">
                  {options.modules.map((m) => (
                    <label key={m.key} className="flex items-center gap-1.5 text-sm text-zinc-300">
                      <Checkbox
                        checked={affectedModules.includes(m.key)}
                        onCheckedChange={(checked) => toggleModule(m.key, checked === true)}
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
                {fieldErrors.affectedModules ? (
                  <p role="alert" className="text-xs text-red-400">
                    {fieldErrors.affectedModules}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="enabled" defaultChecked={announcement?.enabled ?? true} />
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
              placeholder="e.g. Announcing next week's scheduled maintenance"
              className={FIELD_CLASS}
              rows={2}
            />
            <p className="text-xs text-zinc-500">Every change to an announcement is recorded with this reason.</p>
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
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
