"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import type { BillingProviderStatus } from "@cofounderai/core/admin/platform-billing";
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
import { Switch } from "@cofounderai/core/ui/switch";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { updateBillingProviderAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

const splitCodes = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);

/**
 * BILL-29 (§40-§42) -- a provider's non-secret settings. Secrets have their own dialog;
 * switching environment clears the stored secrets server-side (test and live keys are
 * never mixed), which this dialog warns about before saving.
 */
export function ProviderSettingsDialog({
  provider,
  name,
  publicKeyLabel,
  accountLabel,
}: {
  provider: BillingProviderStatus;
  name: string;
  publicKeyLabel: string;
  accountLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(provider.enabled);
  const [environment, setEnvironment] = useState(provider.environment);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setEnabled(provider.enabled);
    setEnvironment(provider.environment);
    setReason("");
    setError(null);
    setFieldErrors({});
  }

  const switchingEnvironment = environment !== provider.environment;
  const hasSecrets = provider.secretKeyConfigured || provider.webhookSecretConfigured;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateBillingProviderAction({
        provider: provider.provider,
        enabled,
        environment,
        priority: String(form.get("priority") ?? "0"),
        supportedCurrencies: splitCodes(String(form.get("supportedCurrencies") ?? "")),
        supportedCountries: splitCodes(String(form.get("supportedCountries") ?? "")),
        publicKey: String(form.get("publicKey") ?? ""),
        accountId: String(form.get("accountId") ?? ""),
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(`${name} settings saved.`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-h-[90vh] max-w-lg overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{name} settings</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Non-secret configuration. Keys and webhook secrets are set separately. Every change is recorded with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-200">
            <span>
              Enabled
              <span className="block text-xs text-zinc-500">Offer this provider at checkout for its currencies.</span>
            </span>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={`${name} enabled`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field id={`${provider.provider}-environment`} label="Environment">
              <NativeSelect
                id={`${provider.provider}-environment`}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "test" | "live")}
                className={FIELD_CLASS}
              >
                <option value="test">Test</option>
                <option value="live">Live</option>
              </NativeSelect>
            </Field>
            <Field id={`${provider.provider}-priority`} label="Priority" error={fieldErrors.priority}>
              <Input
                id={`${provider.provider}-priority`}
                name="priority"
                type="number"
                min={0}
                max={1000}
                step={1}
                defaultValue={provider.priority}
                className={FIELD_CLASS}
              />
            </Field>
          </div>
          {switchingEnvironment && hasSecrets ? (
            <p role="alert" className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3 text-xs text-amber-200">
              Switching to {environment} clears the stored secret key and webhook secret. Enter the {environment} secrets
              afterwards — nothing will work until you do.
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Switching environment clears the stored secrets; test and live keys are never mixed.</p>
          )}

          <Field id={`${provider.provider}-currencies`} label="Currencies (comma-separated)" error={fieldErrors.supportedCurrencies}>
            <Input
              id={`${provider.provider}-currencies`}
              name="supportedCurrencies"
              defaultValue={provider.supportedCurrencies.join(", ")}
              placeholder="INR, USD"
              className={FIELD_CLASS}
            />
          </Field>
          <Field id={`${provider.provider}-countries`} label="Countries (comma-separated, blank = any)" error={fieldErrors.supportedCountries}>
            <Input
              id={`${provider.provider}-countries`}
              name="supportedCountries"
              defaultValue={provider.supportedCountries.join(", ")}
              placeholder="IN"
              className={FIELD_CLASS}
            />
          </Field>
          <Field id={`${provider.provider}-public-key`} label={publicKeyLabel} error={fieldErrors.publicKey}>
            <Input
              id={`${provider.provider}-public-key`}
              name="publicKey"
              defaultValue={provider.publicKey ?? ""}
              autoComplete="off"
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
          </Field>
          <Field id={`${provider.provider}-account`} label={`${accountLabel} (optional)`} error={fieldErrors.accountId}>
            <Input
              id={`${provider.provider}-account`}
              name="accountId"
              defaultValue={provider.accountId ?? ""}
              autoComplete="off"
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
          </Field>

          <Field id={`${provider.provider}-settings-reason`} label="Reason (required)" error={fieldErrors.reason}>
            <Textarea
              id={`${provider.provider}-settings-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Going live with Razorpay"
              className={FIELD_CLASS}
              rows={2}
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
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving…" : "Save settings"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
