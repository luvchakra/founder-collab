"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { SubscriptionLifecycleSettings, SubscriptionTaxMode } from "@cofounderai/core/billing/lifecycle";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateSubscriptionBillingConfigAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/** PLATFORM-P1-05.1/05.3 -- billing currencies and WonderArk's own subscription tax. */
export function BillingConfigDialog({ settings }: { settings: SubscriptionLifecycleSettings }) {
  const [open, setOpen] = useState(false);
  const [currencies, setCurrencies] = useState(settings.supportedCurrencies.join(", "));
  const [taxMode, setTaxMode] = useState<SubscriptionTaxMode>(settings.taxMode);
  const [taxLabel, setTaxLabel] = useState(settings.taxLabel ?? "");
  const [taxRate, setTaxRate] = useState(settings.taxRatePercent === null ? "" : String(settings.taxRatePercent));
  const [sellerTaxId, setSellerTaxId] = useState(settings.sellerTaxId ?? "");
  const [taxCountry, setTaxCountry] = useState(settings.taxCountry ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fixed = taxMode === "inclusive" || taxMode === "exclusive";

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateSubscriptionBillingConfigAction({
        supportedCurrencies: currencies.split(",").map((c) => c.trim()).filter(Boolean),
        taxMode,
        taxLabel: taxLabel.trim() || null,
        taxRatePercent: taxRate.trim() === "" ? null : taxRate,
        sellerTaxId: sellerTaxId.trim() || null,
        taxCountry: taxCountry.trim() || null,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Billing currency and tax saved.");
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
          <DialogTitle>Currency and subscription tax</DialogTitle>
          <DialogDescription className="text-zinc-400">
            WonderArk&apos;s own tax on what it charges businesses -- separate from any business&apos;s own tax compliance.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currencies" className={LABEL_CLASS}>
              Supported currencies
            </Label>
            <Input id="currencies" value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="INR, USD" className={FIELD_CLASS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tax-mode" className={LABEL_CLASS}>
              Tax
            </Label>
            <NativeSelect id="tax-mode" value={taxMode} onChange={(e) => setTaxMode(e.target.value as SubscriptionTaxMode)} className={FIELD_CLASS}>
              <option value="provider">Calculated by the payment provider</option>
              <option value="inclusive">Fixed rate, included in the price</option>
              <option value="exclusive">Fixed rate, added to the price</option>
              <option value="none">No tax charged</option>
            </NativeSelect>
          </div>
          {fixed ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-label" className={LABEL_CLASS}>
                  Label
                </Label>
                <Input id="tax-label" value={taxLabel} onChange={(e) => setTaxLabel(e.target.value)} placeholder="GST" className={FIELD_CLASS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-rate" className={LABEL_CLASS}>
                  Rate (%)
                </Label>
                <Input id="tax-rate" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="18" className={FIELD_CLASS} />
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seller-tax-id" className={LABEL_CLASS}>
                WonderArk tax ID
              </Label>
              <Input id="seller-tax-id" value={sellerTaxId} onChange={(e) => setSellerTaxId(e.target.value)} placeholder="e.g. GSTIN" className={FIELD_CLASS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tax-country" className={LABEL_CLASS}>
                Registered in (country)
              </Label>
              <Input id="tax-country" value={taxCountry} onChange={(e) => setTaxCountry(e.target.value)} placeholder="IN" maxLength={2} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="config-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea id="config-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={FIELD_CLASS} rows={2} maxLength={500} />
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
