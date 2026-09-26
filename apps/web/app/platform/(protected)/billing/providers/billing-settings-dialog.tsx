"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { BillingSettings } from "@cofounderai/core/admin/platform-billing";
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
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Switch } from "@cofounderai/core/ui/switch";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateBillingSettingsAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

type Timing = BillingSettings["upgradeTiming"];

/** BILL-29 -- platform-wide plan-change policy (upgrade/downgrade timing, proration). */
export function BillingSettingsDialog({ settings }: { settings: BillingSettings }) {
  const [open, setOpen] = useState(false);
  const [upgradeTiming, setUpgradeTiming] = useState<Timing>(settings.upgradeTiming);
  const [downgradeTiming, setDowngradeTiming] = useState<Timing>(settings.downgradeTiming);
  const [prorationEnabled, setProrationEnabled] = useState(settings.prorationEnabled);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setUpgradeTiming(settings.upgradeTiming);
    setDowngradeTiming(settings.downgradeTiming);
    setProrationEnabled(settings.prorationEnabled);
    setReason("");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateBillingSettingsAction({ upgradeTiming, downgradeTiming, prorationEnabled, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Billing settings saved.");
      onOpenChange(false);
    });
  }

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
          <DialogTitle>Billing settings</DialogTitle>
          <DialogDescription className="text-zinc-400">Applies to every business&apos;s future plan changes. Recorded with your reason.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upgrade-timing" className={LABEL_CLASS}>
                Upgrades
              </Label>
              <NativeSelect id="upgrade-timing" value={upgradeTiming} onChange={(e) => setUpgradeTiming(e.target.value as Timing)} className={FIELD_CLASS}>
                <option value="immediate">Immediately</option>
                <option value="next_renewal">At next renewal</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="downgrade-timing" className={LABEL_CLASS}>
                Downgrades
              </Label>
              <NativeSelect id="downgrade-timing" value={downgradeTiming} onChange={(e) => setDowngradeTiming(e.target.value as Timing)} className={FIELD_CLASS}>
                <option value="immediate">Immediately</option>
                <option value="next_renewal">At next renewal</option>
              </NativeSelect>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
            <span>
              Proration
              <span className="block text-xs text-zinc-500">Charge or credit the difference for the rest of the period.</span>
            </span>
            <Switch checked={prorationEnabled} onCheckedChange={setProrationEnabled} aria-label="Proration enabled" />
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billing-settings-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="billing-settings-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Downgrades should wait for renewal"
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
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
