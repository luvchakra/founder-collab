"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AI_PROVIDER_LABELS, type AiProvider } from "@cofounderai/module-discovery/lib/ai-providers/types";
import type { ConnectProviderActionState } from "@/app/(dashboard)/dashboard/settings/billing/actions";

const PROVIDERS: AiProvider[] = ["openai", "anthropic", "google"];

export function AiProviderForm({
  action,
  defaultProvider,
  submitLabel,
}: {
  action: (
    prevState: ConnectProviderActionState,
    formData: FormData,
  ) => Promise<ConnectProviderActionState>;
  defaultProvider?: AiProvider;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ConnectProviderActionState, FormData>(
    action,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">AI Provider</legend>
        {PROVIDERS.map((provider) => (
          <label key={provider} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="provider"
              value={provider}
              defaultChecked={provider === (defaultProvider ?? "anthropic")}
              className="size-4"
            />
            {AI_PROVIDER_LABELS[provider]}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <Label htmlFor="apiKey">API Key</Label>
        <Input id="apiKey" name="apiKey" type="password" autoComplete="off" required />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Testing connection...">{submitLabel}</SubmitButton>
    </form>
  );
}
