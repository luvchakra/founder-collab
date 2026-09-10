import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getAiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/queries";
import { AI_PROVIDER_LABELS } from "@cofounderai/module-discovery/lib/ai-providers/types";
import { FREE_TIER_MONTHLY_COST_LIMIT_USD, FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { AiProviderForm } from "@/components/settings/ai-provider-form";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { connectProviderAction, disconnectProviderAction } from "./actions";

export default async function AiProviderSettingsPage() {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");

  const connection = await getAiProviderConnection(account.id);
  const boundConnectAction = connectProviderAction.bind(null, account.id);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">AI Provider</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {connection
            ? "AI features run on your own connected provider account and your own API key -- your usage bills directly to your provider, with no monthly cap from us."
            : "You're currently using CoFounderAI's included AI credits, capped at a modest free-tier allowance each month. Connect your own provider key any time to bypass that cap and bill usage directly to your own account instead."}
        </p>
      </div>

      {connection ? (
        <div className="flex flex-col gap-4 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{AI_PROVIDER_LABELS[connection.provider]}</p>
              <p className="text-sm text-muted-foreground">
                ••••••••••••{connection.keyFingerprint}
              </p>
            </div>
            {connection.status === "connected" ? (
              <span className="text-sm text-emerald-600">✓ Connected</span>
            ) : (
              <span className="text-sm text-destructive">Connection error</span>
            )}
          </div>
          {connection.lastError ? (
            <p className="text-sm text-destructive">{connection.lastError}</p>
          ) : null}

          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">Use CoFounderAI&apos;s included credits instead</p>
            <p className="text-xs text-muted-foreground">
              Switch off your own key and fall back to our free tier -- up to{" "}
              {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs (${FREE_TIER_MONTHLY_COST_LIMIT_USD} of spend) per
              workspace per month, no key required.
            </p>
            <form action={disconnectProviderAction.bind(null, account.id)}>
              <SubmitButton variant="outline" size="sm" pendingText="Switching..." className="self-start">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Use included credits
              </SubmitButton>
            </form>
          </div>

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Replace key</p>
            <AiProviderForm
              action={boundConnectAction}
              defaultProvider={connection.provider}
              submitLabel="Replace key"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              Using CoFounderAI&apos;s included credits
            </p>
            <p className="text-xs text-muted-foreground">
              No key connected -- AI features run on our free tier, up to{" "}
              {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs (${FREE_TIER_MONTHLY_COST_LIMIT_USD} of spend) per
              workspace per month.
            </p>
            <Link href="/dashboard/settings/usage" className="self-start text-xs font-medium text-primary hover:underline">
              View your current usage →
            </Link>
          </div>

          <div className="rounded-md border p-4">
            <p className="mb-3 text-sm font-medium">Bring your own key (optional)</p>
            <AiProviderForm action={boundConnectAction} submitLabel="Connect" />
          </div>
        </>
      )}
    </main>
  );
}
