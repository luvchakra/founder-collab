"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import type { PlanPriceRow } from "@cofounderai/core/admin/platform-billing-ops";
import { Badge } from "@cofounderai/core/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { createPlanPriceAction, setPlanPriceActiveAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/** A price row plus its amount pre-formatted on the server (avoids a locale hydration mismatch). */
export type BillingPriceView = PlanPriceRow & { amountLabel: string };

/**
 * BILL-32 (§35, §72) -- this plan's provider price mappings: which Razorpay plan / Stripe
 * price a checkout uses per environment, currency and interval. Provider ids are not
 * secrets. Adding a price replaces (deactivates, never deletes) the active one it covers,
 * so subscriptions already on the old price keep resolving to this plan.
 */
export function BillingPricesSection({
  planId,
  planName,
  prices,
  defaultCurrency,
  defaultInterval,
}: {
  planId: string;
  planName: string;
  prices: BillingPriceView[];
  defaultCurrency: string;
  defaultInterval: string;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(price: BillingPriceView) {
    setPendingId(price.id);
    startTransition(async () => {
      const result = await setPlanPriceActiveAction(planId, price.id, !price.active);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(price.active ? "Price deactivated." : "Price activated.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Billing prices</h2>
          <p className="text-xs text-zinc-500">
            The provider price each checkout for {planName} uses, per provider, environment, currency and interval. Create
            the price at the provider first, then record its id here.
          </p>
        </div>
        <AddPriceDialog planId={planId} defaultCurrency={defaultCurrency} defaultInterval={defaultInterval} />
      </div>

      {prices.length === 0 ? (
        <p className="p-6 text-center text-sm text-zinc-400">No provider prices yet — this plan can&apos;t be bought through checkout.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Provider</TableHead>
              <TableHead className="text-zinc-400">Environment</TableHead>
              <TableHead className="text-zinc-400">Amount</TableHead>
              <TableHead className="text-zinc-400">Provider ids</TableHead>
              <TableHead className="text-zinc-400">Status</TableHead>
              <TableHead className="text-right text-zinc-400">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.map((price) => (
              <TableRow key={price.id} className="border-zinc-800 hover:bg-zinc-900/60">
                <TableCell className="text-zinc-100">{price.provider === "razorpay" ? "Razorpay" : "Stripe"}</TableCell>
                <TableCell>
                  <Badge variant={price.environment === "live" ? "success" : "warning"}>{price.environment}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-zinc-300">
                  {price.amountLabel} <span className="text-zinc-500">/ {price.billingInterval}</span>
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">
                  <p className="break-all text-zinc-200">{price.providerPriceId}</p>
                  {price.providerProductId ? <p className="break-all">{price.providerProductId}</p> : null}
                </TableCell>
                <TableCell>
                  <Badge variant={price.active ? "success" : "secondary"}>{price.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                    onClick={() => toggle(price)}
                    disabled={pendingId === price.id}
                  >
                    {pendingId === price.id ? "Saving…" : price.active ? "Deactivate" : "Activate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function AddPriceDialog({ planId, defaultCurrency, defaultInterval }: { planId: string; defaultCurrency: string; defaultInterval: string }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<"razorpay" | "stripe">("razorpay");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setProvider("razorpay");
    setError(null);
    setFormKey((k) => k + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createPlanPriceAction(planId, {
        provider,
        environment: String(form.get("environment") ?? "test") as "test" | "live",
        currency: String(form.get("currency") ?? ""),
        billingInterval: String(form.get("billingInterval") ?? "month") as "month" | "year",
        amount: Number(form.get("amount") ?? 0),
        providerProductId: String(form.get("providerProductId") ?? ""),
        providerPriceId: String(form.get("providerPriceId") ?? ""),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Price added.");
      onOpenChange(false);
    });
  }

  const interval = defaultInterval === "year" ? "year" : "month";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Plus className="size-4" aria-hidden="true" />
          Add price
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-h-[90vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>Add provider price</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Replaces the active price for the same provider, environment, currency and interval. The old one is deactivated, not
            deleted.
          </DialogDescription>
        </DialogHeader>
        <form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="price-provider" label="Provider">
              <NativeSelect
                id="price-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as "razorpay" | "stripe")}
                className={FIELD_CLASS}
              >
                <option value="razorpay">Razorpay</option>
                <option value="stripe">Stripe</option>
              </NativeSelect>
            </Field>
            <Field id="price-environment" label="Environment">
              <NativeSelect id="price-environment" name="environment" defaultValue="test" className={FIELD_CLASS}>
                <option value="test">Test</option>
                <option value="live">Live</option>
              </NativeSelect>
            </Field>
            <Field id="price-currency" label="Currency">
              <Input id="price-currency" name="currency" defaultValue={defaultCurrency} maxLength={3} className={`${FIELD_CLASS} uppercase`} />
            </Field>
            <Field id="price-interval" label="Interval">
              <NativeSelect id="price-interval" name="billingInterval" defaultValue={interval} className={FIELD_CLASS}>
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </NativeSelect>
            </Field>
          </div>
          <Field id="price-amount" label="Amount">
            <Input id="price-amount" name="amount" type="number" inputMode="decimal" min="0" step="0.01" required className={FIELD_CLASS} />
          </Field>
          <Field id="price-product-id" label={provider === "stripe" ? "Product id (optional)" : "Product / item id (optional)"}>
            <Input
              id="price-product-id"
              name="providerProductId"
              autoComplete="off"
              placeholder={provider === "stripe" ? "prod_…" : ""}
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
          </Field>
          <Field id="price-provider-id" label={provider === "stripe" ? "Price id" : "Plan id"}>
            <Input
              id="price-provider-id"
              name="providerPriceId"
              autoComplete="off"
              required
              placeholder={provider === "stripe" ? "price_…" : "plan_…"}
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add price"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </Label>
      {children}
    </div>
  );
}
