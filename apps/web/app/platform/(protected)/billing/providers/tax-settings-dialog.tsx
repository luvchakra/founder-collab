"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { SubscriptionTaxSettings } from "@cofounderai/core/admin/platform-billing";
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
import { Switch } from "@cofounderai/core/ui/switch";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateSubscriptionTaxAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/** PLATFORM-P1-05.3 -- WonderArk's tax on its own subscriptions, separate from any
 * business's tax compliance. Same reason-required, audited shape as the other billing
 * settings dialogs. */
export function TaxSettingsDialog({ settings }: { settings: SubscriptionTaxSettings }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(settings.label);
  const [rate, setRate] = useState(String(settings.rate));
  const [pricesIncludeTax, setPricesIncludeTax] = useState(settings.pricesIncludeTax);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setLabel(settings.label);
    setRate(String(settings.rate));
    setPricesIncludeTax(settings.pricesIncludeTax);
    setReason("");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriptionTaxAction({ label, rate, pricesIncludeTax, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Subscription tax saved.");
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
          <DialogTitle>Subscription tax</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Match how your Razorpay or Stripe prices are set up. Customers see it next to plan prices; it doesn&apos;t change what the provider charges.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-label" className={LABEL_CLASS}>
                Tax name
              </Label>
              <Input id="tax-label" value={label} maxLength={20} placeholder="GST" onChange={(e) => setLabel(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-rate" className={LABEL_CLASS}>
                Rate (%, 0 = none)
              </Label>
              <Input id="tax-rate" type="number" min={0} max={50} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
            <span>Prices include tax</span>
            <Switch checked={pricesIncludeTax} onCheckedChange={setPricesIncludeTax} aria-label="Prices include tax" />
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="tax-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 18% GST, included in prices" className={FIELD_CLASS} rows={2} />
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
