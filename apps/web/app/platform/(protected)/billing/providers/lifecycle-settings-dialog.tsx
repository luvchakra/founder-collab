"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { SubscriptionLifecycleSettings } from "@cofounderai/core/admin/platform-billing";
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
import { updateSubscriptionLifecycleAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P1-04.2 (trials) and PLATFORM-P1-04.3 (grace periods). Same dialog shape as
 * BillingSettingsDialog: every change needs a reason and is recorded in
 * platform.billing_settings_events.
 */
export function LifecycleSettingsDialog({
  settings,
  plans,
}: {
  settings: SubscriptionLifecycleSettings;
  plans: { key: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [trialDays, setTrialDays] = useState(String(settings.trialDays));
  const [trialPlanKeys, setTrialPlanKeys] = useState<string[]>(settings.trialPlanKeys);
  const [trialEntitlements, setTrialEntitlements] = useState(settings.trialEntitlements);
  const [paymentGrace, setPaymentGrace] = useState(settings.paymentGraceDays === null ? "" : String(settings.paymentGraceDays));
  const [featureGrace, setFeatureGrace] = useState(String(settings.featureGraceDays));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setTrialDays(String(settings.trialDays));
    setTrialPlanKeys(settings.trialPlanKeys);
    setTrialEntitlements(settings.trialEntitlements);
    setPaymentGrace(settings.paymentGraceDays === null ? "" : String(settings.paymentGraceDays));
    setFeatureGrace(String(settings.featureGraceDays));
    setReason("");
    setError(null);
  }

  function togglePlan(key: string, checked: boolean) {
    setTrialPlanKeys((keys) => (checked ? [...keys, key] : keys.filter((k) => k !== key)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriptionLifecycleAction({
        trialDays,
        trialPlanKeys,
        trialEntitlements,
        paymentGraceDays: paymentGrace.trim() === "" ? null : paymentGrace,
        featureGraceDays: featureGrace,
        reason,
      });
      if (!result.ok) {
        setError(result.fieldErrors ? Object.values(result.fieldErrors)[0] ?? result.error : result.error);
        return;
      }
      toast.success("Subscription lifecycle saved.");
      onOpenChange(false);
    });
  }

  const trialsOn = Number(trialDays) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Subscription lifecycle</DialogTitle>
          <DialogDescription className="text-zinc-400">Applies to every business from now on. Recorded with your reason.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trial-days" className={LABEL_CLASS}>
              Free trial (days, 0 = off)
            </Label>
            <Input id="trial-days" type="number" min={0} max={90} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className={FIELD_CLASS} />
          </div>
          {trialsOn ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className={`mb-1 text-sm ${LABEL_CLASS}`}>Plans with a trial</legend>
                {plans.map((plan) => (
                  <label key={plan.key} className="flex items-center gap-2 text-sm text-zinc-200">
                    <Checkbox checked={trialPlanKeys.includes(plan.key)} onCheckedChange={(c) => togglePlan(plan.key, c === true)} />
                    {plan.name}
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="trial-entitlements" className={LABEL_CLASS}>
                  During the trial
                </Label>
                <NativeSelect
                  id="trial-entitlements"
                  value={trialEntitlements}
                  onChange={(e) => setTrialEntitlements(e.target.value as SubscriptionLifecycleSettings["trialEntitlements"])}
                  className={FIELD_CLASS}
                >
                  <option value="plan">The plan&apos;s modules</option>
                  <option value="all_modules">Every module</option>
                </NativeSelect>
              </div>
            </>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payment-grace" className={LABEL_CLASS}>
                Payment grace (days)
              </Label>
              <Input
                id="payment-grace"
                type="number"
                min={0}
                max={60}
                placeholder="Until retries end"
                value={paymentGrace}
                onChange={(e) => setPaymentGrace(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="feature-grace" className={LABEL_CLASS}>
                Read-only period (days)
              </Label>
              <Input id="feature-grace" type="number" min={30} max={180} value={featureGrace} onChange={(e) => setFeatureGrace(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lifecycle-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="lifecycle-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Offer a 14-day Pro trial"
              className={FIELD_CLASS}
              rows={2}
            />
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
          <Button type="button" onClick={save} disabled={pending || reason.trim().length === 0}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
