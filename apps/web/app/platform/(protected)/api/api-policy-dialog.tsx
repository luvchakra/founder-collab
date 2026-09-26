"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { ApiPolicy } from "@cofounderai/core/api-v1/policy";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateApiPolicyAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

const FIELDS = [
  { key: "burstLimitPerSecond", label: "Burst limit (requests / second)", group: "api" },
  { key: "maxPayloadKb", label: "Max request body (KB)", group: "api" },
  { key: "webhookMaxRetries", label: "Processing attempts per event", group: "webhook" },
  { key: "webhookTimeoutSeconds", label: "Processing timeout (seconds)", group: "webhook" },
  { key: "webhookSignatureToleranceSeconds", label: "Signature timestamp window (seconds)", group: "webhook" },
] as const;

type Key = (typeof FIELDS)[number]["key"];

/** PLATFORM-P1-06.1/06.3 -- API and webhook policy, saved with a reason. */
export function ApiPolicyDialog({ policy }: { policy: ApiPolicy }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(policy[f.key])])) as Record<Key, string>);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateApiPolicyAction({ ...values, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("API policy saved.");
      setOpen(false);
      setReason("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-h-[90vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>API and webhook policy</DialogTitle>
          <DialogDescription className="text-zinc-400">Applies to every API request and incoming webhook within 30 seconds. Recorded with your reason.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {(["api", "webhook"] as const).map((group) => (
            <fieldset key={group} className="flex flex-col gap-3 border-t border-zinc-800 pt-3 first:border-t-0 first:pt-0">
              <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{group === "api" ? "Public API" : "Incoming webhooks"}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FIELDS.filter((f) => f.group === group).map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`api-${f.key}`} className={LABEL_CLASS}>
                      {f.label}
                    </Label>
                    <Input
                      id={`api-${f.key}`}
                      inputMode="numeric"
                      value={values[f.key]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={FIELD_CLASS}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-policy-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="api-policy-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS} rows={2} maxLength={500} />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || reason.trim().length === 0}>
            {pending ? "Saving…" : "Save policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
