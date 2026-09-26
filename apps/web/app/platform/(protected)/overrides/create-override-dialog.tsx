"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { CreateBusinessOverrideInput } from "@cofounderai/core/admin/platform-business-overrides";
import { createBusinessOverrideAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** PLATFORM-P1-02.1/02.2 -- grant one business a time-boxed exception. Reason, start and
 * expiry are all required; the grantor is recorded server-side. */
export function CreateOverrideDialog({
  businesses,
  features,
  resourceKeys,
}: {
  businesses: { id: string; name: string }[];
  features: { value: string; label: string }[];
  resourceKeys: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const [businessId, setBusinessId] = useState("");
  const [overrideType, setOverrideType] = useState<"limit" | "feature">("limit");
  const [resourceKey, setResourceKey] = useState(resourceKeys[0] ?? "");
  const [limitValue, setLimitValue] = useState("");
  const [feature, setFeature] = useState(features[0]?.value ?? "");
  const [startsAt, setStartsAt] = useState(isoDate(0));
  const [expiresAt, setExpiresAt] = useState(isoDate(30));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
    if (!next) setReason("");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await createBusinessOverrideAction({
        businessId,
        overrideType,
        feature: overrideType === "feature" ? feature : undefined,
        resourceKey: overrideType === "limit" ? (resourceKey as CreateBusinessOverrideInput["resourceKey"]) : undefined,
        limitValue: overrideType === "limit" ? limitValue : undefined,
        startsAt,
        expiresAt,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Exception granted.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Grant exception
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Grant a business exception</DialogTitle>
          <DialogDescription className="text-zinc-400">Overrides the business&apos;s plan until it expires. Recorded in the platform audit log.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-business" className={LABEL_CLASS}>
              Business
            </Label>
            <NativeSelect id="override-business" value={businessId} onChange={(e) => setBusinessId(e.target.value)} className={FIELD_CLASS}>
              <option value="">Choose a business…</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-type" className={LABEL_CLASS}>
                Exception
              </Label>
              <NativeSelect id="override-type" value={overrideType} onChange={(e) => setOverrideType(e.target.value as "limit" | "feature")} className={FIELD_CLASS}>
                <option value="limit">Usage limit</option>
                <option value="feature" disabled={features.length === 0}>
                  Feature
                </option>
              </NativeSelect>
            </div>
            {overrideType === "limit" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="override-resource" className={LABEL_CLASS}>
                  Limit
                </Label>
                <NativeSelect id="override-resource" value={resourceKey} onChange={(e) => setResourceKey(e.target.value)} className={FIELD_CLASS}>
                  {resourceKeys.map((k) => (
                    <option key={k} value={k}>
                      {k.replace(/_/g, " ")}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="override-feature" className={LABEL_CLASS}>
                  Feature
                </Label>
                <NativeSelect id="override-feature" value={feature} onChange={(e) => setFeature(e.target.value)} className={FIELD_CLASS}>
                  {features.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}
          </div>
          {overrideType === "limit" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-limit" className={LABEL_CLASS}>
                Temporary limit
              </Label>
              <Input id="override-limit" inputMode="numeric" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="Blank = unlimited" className={FIELD_CLASS} />
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-start" className={LABEL_CLASS}>
                Starts
              </Label>
              <Input id="override-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-expiry" className={LABEL_CLASS}>
                Expires
              </Label>
              <Input id="override-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Enterprise pilot" className={FIELD_CLASS} rows={2} maxLength={500} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || !businessId || reason.trim().length === 0}>
            {pending ? "Saving…" : "Grant exception"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
