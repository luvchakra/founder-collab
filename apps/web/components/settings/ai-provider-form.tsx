"use client";

import { useActionState, useState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AI_PROVIDER_LABELS, type AiProvider } from "@cofounderai/module-discovery/lib/ai-providers/types";
import type { ConnectProviderActionState } from "@/app/(dashboard)/dashboard/settings/billing/actions";

const PROVIDERS: AiProvider[] = ["openai", "anthropic", "google"];

/** Not a real `AiProvider` -- there's no such AI provider in the model registry, this
 * radio choice just means "no BYOK key, run on the platform's own included credits."
 * Folds what used to be a separate "Use included credits instead" box/button into the
 * same provider picker instead of a second control next to it. */
const INTERNAL = "internal" as const;

export function AiProviderForm({
  action,
  disconnectAction,
  defaultProvider,
  submitLabel,
}: {
  action: (
    prevState: ConnectProviderActionState,
    formData: FormData,
  ) => Promise<ConnectProviderActionState>;
  /** Runs instead of `action` when "App Internal AI" is selected -- the same disconnect
   * Server Action the Billing page already had wired to its old included-credits button
   * (settings/billing/actions.ts's disconnectProviderAction). */
  disconnectAction: () => Promise<void>;
  defaultProvider?: AiProvider;
  submitLabel: string;
}) {
  const [selected, setSelected] = useState<AiProvider | typeof INTERNAL>(defaultProvider ?? "anthropic");

  const [state, formAction] = useActionState<ConnectProviderActionState, FormData>(
    async (prevState, formData) => {
      if (String(formData.get("provider")) === INTERNAL) {
        await disconnectAction();
        return null;
      }
      return action(prevState, formData);
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">AI Provider</legend>
        {PROVIDERS.map((provider) => (
          <label key={provider} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="provider"
              value={provider}
              checked={selected === provider}
              onChange={() => setSelected(provider)}
              className="size-4"
            />
            {AI_PROVIDER_LABELS[provider]}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="provider"
            value={INTERNAL}
            checked={selected === INTERNAL}
            onChange={() => setSelected(INTERNAL)}
            className="size-4"
          />
          App Internal AI
        </label>
      </fieldset>

      {selected === INTERNAL ? (
        <p className="text-xs text-muted-foreground">
          Runs on {BRAND_NAME}&apos;s included credits -- no API key needed.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="apiKey">API Key</Label>
          <Input id="apiKey" name="apiKey" type="password" autoComplete="off" required />
        </div>
      )}

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton pendingText="Testing connection...">
        {selected === INTERNAL ? "Use App Internal AI" : submitLabel}
      </SubmitButton>
    </form>
  );
}
