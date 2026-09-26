"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
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
import { Label } from "@cofounderai/core/ui/label";
import { PasswordInput } from "@cofounderai/core/ui/password-input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { setBillingProviderSecretsAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * BILL-29 (§41, §43) -- write-only secrets. The fields always start empty (nothing secret
 * ever reaches the browser to prefill them), blank keeps what's stored, and the form is
 * cleared on close. Only "Configured · fingerprint" is ever shown back.
 */
export function ProviderSecretsDialog({ provider, name }: { provider: BillingProviderStatus; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [formKey, setFormKey] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setReason("");
    setError(null);
    setFieldErrors({});
    // Remount the form so no typed secret lingers in an uncontrolled input.
    setFormKey((k) => k + 1);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await setBillingProviderSecretsAction({
        provider: provider.provider,
        environment: provider.environment,
        secretKey: String(form.get("secretKey") ?? ""),
        webhookSecret: String(form.get("webhookSecret") ?? ""),
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(`${name} secrets saved.`);
      onOpenChange(false);
    });
  }

  const secretLabel = provider.provider === "razorpay" ? "Key secret" : "Secret key";
  const webhookLabel = provider.provider === "stripe" ? "Webhook signing secret" : "Webhook secret";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <KeyRound className="size-4" aria-hidden="true" />
          Set secrets
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>
            {name} secrets ({provider.environment})
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Stored encrypted and never shown again. Leave a field blank to keep what&apos;s stored. Recorded with your reason
            — the secret itself is never logged.
          </DialogDescription>
        </DialogHeader>
        <form key={formKey} onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="off">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${provider.provider}-secret-key`} className={LABEL_CLASS}>
              {secretLabel}
            </Label>
            <PasswordInput
              id={`${provider.provider}-secret-key`}
              name="secretKey"
              autoComplete="new-password"
              placeholder={provider.secretKeyConfigured ? "Configured — leave blank to keep" : "Not configured"}
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
            <StoredStatus configured={provider.secretKeyConfigured} fingerprint={provider.secretKeyFingerprint} />
            {fieldErrors.secretKey ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.secretKey}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${provider.provider}-webhook-secret`} className={LABEL_CLASS}>
              {webhookLabel}
            </Label>
            <PasswordInput
              id={`${provider.provider}-webhook-secret`}
              name="webhookSecret"
              autoComplete="new-password"
              placeholder={provider.webhookSecretConfigured ? "Configured — leave blank to keep" : "Not configured"}
              className={`${FIELD_CLASS} font-mono text-xs`}
            />
            <StoredStatus configured={provider.webhookSecretConfigured} fingerprint={provider.webhookSecretFingerprint} />
            {fieldErrors.webhookSecret ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.webhookSecret}
              </p>
            ) : null}
          </div>
          <p className="text-xs text-zinc-500">
            These are the {provider.environment} secrets. To use the other environment, switch it in Settings first (that clears
            what&apos;s stored here).
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${provider.provider}-secrets-reason`} className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id={`${provider.provider}-secrets-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rotating keys after staff change"
              className={FIELD_CLASS}
              rows={2}
            />
          </div>
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
              {pending ? "Saving…" : "Save secrets"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StoredStatus({ configured, fingerprint }: { configured: boolean; fingerprint: string | null }) {
  return (
    <p className="text-xs text-zinc-500">
      {configured ? `Configured${fingerprint ? ` · fingerprint ${fingerprint}` : ""}` : "Not configured"}
    </p>
  );
}
