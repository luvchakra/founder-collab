"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { RESOURCE_KEYS, RESOURCE_LABELS, type ResourceKey } from "@cofounderai/core/admin/platform-limits-constants";
import { Button } from "@cofounderai/core/ui/button";
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
import { createOverrideAction, revokeOverrideAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

function isoDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** PLATFORM-P1-02.1/02.2: one business, one resource, a limit, a window and a reason. */
export function NewOverrideDialog({ businesses }: { businesses: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [businessId, setBusinessId] = useState("");
  const [resourceKey, setResourceKey] = useState<ResourceKey>("prospects");
  const [state, setState] = useState<"limited" | "unlimited">("limited");
  const [limitValue, setLimitValue] = useState("");
  const [startsOn, setStartsOn] = useState(isoDay(0));
  const [expiresOn, setExpiresOn] = useState(isoDay(30));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setBusinessId("");
    setResourceKey("prospects");
    setState("limited");
    setLimitValue("");
    setStartsOn(isoDay(0));
    setExpiresOn(isoDay(30));
    setReason("");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await createOverrideAction({
        businessId,
        resourceKey,
        state,
        limitValue: state === "limited" && limitValue.trim() !== "" ? limitValue : null,
        // Today means "from now", not from 00:00 UTC.
        startsOn: startsOn && startsOn > isoDay(0) ? startsOn : null,
        expiresOn,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Override created.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          New override
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>New business override</DialogTitle>
          <DialogDescription className="text-zinc-400">Replaces the plan&apos;s limit for one business until it expires. Recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-business" className={LABEL_CLASS}>
              Business
            </Label>
            <NativeSelect id="override-business" value={businessId} onChange={(e) => setBusinessId(e.target.value)} className={FIELD_CLASS}>
              <option value="">Choose a business</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-resource" className={LABEL_CLASS}>
                Resource
              </Label>
              <NativeSelect id="override-resource" value={resourceKey} onChange={(e) => setResourceKey(e.target.value as ResourceKey)} className={FIELD_CLASS}>
                {RESOURCE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {RESOURCE_LABELS[key]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-limit" className={LABEL_CLASS}>
                Limit
              </Label>
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Limit type"
                  value={state}
                  onChange={(e) => setState(e.target.value as "limited" | "unlimited")}
                  className={FIELD_CLASS}
                >
                  <option value="limited">Up to</option>
                  <option value="unlimited">Unlimited</option>
                </NativeSelect>
                {state === "limited" ? (
                  <Input id="override-limit" type="number" min={0} value={limitValue} onChange={(e) => setLimitValue(e.target.value)} className={FIELD_CLASS} />
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-starts" className={LABEL_CLASS}>
                Starts
              </Label>
              <Input id="override-starts" type="date" min={isoDay(0)} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="override-expires" className={LABEL_CLASS}>
                Expires (end of day, UTC)
              </Label>
              <Input id="override-expires" type="date" min={isoDay(0)} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Enterprise pilot" className={FIELD_CLASS} rows={2} />
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
            {pending ? "Saving…" : "Create override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** PLATFORM-P1-02.3: ending an override early is a recorded decision with its own reason. */
export function RevokeOverrideDialog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setReason("");
    setError(null);
  }

  function revoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeOverrideAction(id, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Override revoked. The plan's limit applies again.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Revoke override</DialogTitle>
          <DialogDescription className="text-zinc-400">{label}. The plan&apos;s limit applies again straight away.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`revoke-reason-${id}`} className={LABEL_CLASS}>
            Reason (required)
          </Label>
          <Textarea id={`revoke-reason-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Pilot ended early" className={FIELD_CLASS} rows={2} />
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
          <Button type="button" variant="destructive" onClick={revoke} disabled={pending || reason.trim().length === 0}>
            {pending ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
