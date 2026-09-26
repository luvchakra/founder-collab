"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { SubscriptionLifecycleSettings } from "@cofounderai/core/billing/lifecycle";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateSubscriptionLifecycleAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

/** PLATFORM-P1-04.2/04.3 -- trial and grace settings, saved with a reason. */
export function LifecycleDialog({
  settings,
  plans,
  modules,
}: {
  settings: SubscriptionLifecycleSettings;
  plans: { id: string; name: string }[];
  modules: { key: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [trialDays, setTrialDays] = useState(String(settings.trialDays));
  const [trialPlanIds, setTrialPlanIds] = useState<string[]>(settings.trialPlanIds);
  const [limitModules, setLimitModules] = useState(settings.trialModuleKeys !== null);
  const [trialModules, setTrialModules] = useState<string[]>(settings.trialModuleKeys ?? []);
  const [paymentGrace, setPaymentGrace] = useState(String(settings.paymentGraceDays));
  const [featureGrace, setFeatureGrace] = useState(String(settings.featureGraceDays));
  const [retention, setRetention] = useState(settings.lockedDataRetentionDays === null ? "" : String(settings.lockedDataRetentionDays));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriptionLifecycleAction({
        trialDays,
        trialPlanIds,
        trialModuleKeys: limitModules ? trialModules : null,
        paymentGraceDays: paymentGrace,
        featureGraceDays: featureGrace,
        lockedDataRetentionDays: retention.trim() === "" ? null : retention,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Lifecycle settings saved.");
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
          <DialogTitle>Trials and grace periods</DialogTitle>
          <DialogDescription className="text-zinc-400">Applies to every business from the next subscription change. Recorded with your reason.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Trial</legend>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trial-days" className={LABEL_CLASS}>
                Trial length (days, 0 = no trials)
              </Label>
              <Input id="trial-days" inputMode="numeric" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={`text-sm ${LABEL_CLASS}`}>Eligible plans</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {plans.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-200">
                    <Checkbox checked={trialPlanIds.includes(p.id)} onCheckedChange={(v) => setTrialPlanIds((l) => toggle(l, p.id, v === true))} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <Checkbox checked={limitModules} onCheckedChange={(v) => setLimitModules(v === true)} />
              Limit the trial to some modules
            </label>
            {limitModules ? (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
                {modules.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 text-sm text-zinc-200">
                    <Checkbox checked={trialModules.includes(m.key)} onCheckedChange={(v) => setTrialModules((l) => toggle(l, m.key, v === true))} />
                    {m.name}
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
          <fieldset className="flex flex-col gap-3 border-t border-zinc-800 pt-4">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Grace</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payment-grace" className={LABEL_CLASS}>
                  Payment grace (days)
                </Label>
                <Input id="payment-grace" inputMode="numeric" value={paymentGrace} onChange={(e) => setPaymentGrace(e.target.value)} className={FIELD_CLASS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="feature-grace" className={LABEL_CLASS}>
                  Read-only grace (days, min 30)
                </Label>
                <Input id="feature-grace" inputMode="numeric" value={featureGrace} onChange={(e) => setFeatureGrace(e.target.value)} className={FIELD_CLASS} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retention" className={LABEL_CLASS}>
                Data kept after lock (days, blank = indefinitely)
              </Label>
              <Input id="retention" inputMode="numeric" value={retention} onChange={(e) => setRetention(e.target.value)} placeholder="Indefinitely" className={FIELD_CLASS} />
              <p className="text-xs text-zinc-500">A retention commitment only -- nothing ever deletes customer data when a subscription ends.</p>
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lifecycle-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="lifecycle-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS} rows={2} maxLength={500} />
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
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
