import type { ReactNode } from "react";
import { getBillingProviderStatus, getBillingSettings, type BillingProviderStatus } from "@cofounderai/core/admin/platform-billing";
import { SITE_URL } from "@cofounderai/core/site";
import { Badge } from "@cofounderai/core/ui/badge";
import { PlatformImpactBanner } from "../../../impact-banner";
import { EnvironmentBadge, Panel, formatWhen } from "../billing-ui";
import { BillingSettingsDialog } from "./billing-settings-dialog";
import { CopyButton } from "./copy-button";
import { ProviderSecretsDialog } from "./provider-secrets-dialog";
import { ProviderSettingsDialog } from "./provider-settings-dialog";

/**
 * BILL-29 -- provider settings (§40-§43) and platform billing policy. Secrets are
 * write-only: this page only ever receives "configured" plus an 8-character fingerprint
 * from getBillingProviderStatus(), and the secrets dialog never prefills anything.
 */
const PROVIDER_META: Record<string, { name: string; publicKeyLabel: string; accountLabel: string }> = {
  razorpay: { name: "Razorpay", publicKeyLabel: "Key ID", accountLabel: "Merchant / account id" },
  stripe: { name: "Stripe", publicKeyLabel: "Publishable key", accountLabel: "Account id" },
};

export default async function PlatformBillingProvidersPage() {
  const [providers, settings] = await Promise.all([getBillingProviderStatus(), getBillingSettings()]);
  const base = SITE_URL.replace(/\/+$/, "");

  return (
    <div className="flex flex-col gap-6">
      <PlatformImpactBanner />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {providers.map((p) => {
          const meta = PROVIDER_META[p.provider] ?? { name: p.provider, publicKeyLabel: "Public key", accountLabel: "Account id" };
          return (
            <ProviderCard
              key={p.provider}
              provider={p}
              name={meta.name}
              publicKeyLabel={meta.publicKeyLabel}
              accountLabel={meta.accountLabel}
              webhookUrl={`${base}/api/webhooks/billing/${p.provider}`}
            />
          );
        })}
      </div>

      <Panel
        title="Billing settings"
        description="How plan changes are timed and charged, for every business."
        action={<BillingSettingsDialog settings={settings} />}
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Fact label="Upgrades take effect">{timingLabel(settings.upgradeTiming)}</Fact>
          <Fact label="Downgrades take effect">{timingLabel(settings.downgradeTiming)}</Fact>
          <Fact label="Proration">{settings.prorationEnabled ? "On" : "Off"}</Fact>
        </dl>
        <p className="text-xs text-zinc-500">Last updated {formatWhen(settings.updatedAt)}</p>
      </Panel>
    </div>
  );
}

function timingLabel(value: "immediate" | "next_renewal") {
  return value === "immediate" ? "Immediately" : "At next renewal";
}

function ProviderCard({
  provider,
  name,
  publicKeyLabel,
  accountLabel,
  webhookUrl,
}: {
  provider: BillingProviderStatus;
  name: string;
  publicKeyLabel: string;
  accountLabel: string;
  webhookUrl: string;
}) {
  const complete = Boolean(provider.publicKey) && provider.secretKeyConfigured && provider.webhookSecretConfigured && provider.supportedCurrencies.length > 0;
  return (
    <Panel
      title={name}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <EnvironmentBadge environment={provider.environment} />
          <Badge variant={provider.enabled ? "success" : "secondary"}>{provider.enabled ? "Enabled" : "Disabled"}</Badge>
        </div>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Fact label="Configuration">
          <Badge variant={complete ? "success" : "warning"}>{complete ? "Complete" : "Incomplete"}</Badge>
        </Fact>
        <Fact label="Priority">{provider.priority}</Fact>
        <Fact label="Currencies">{provider.supportedCurrencies.length ? provider.supportedCurrencies.join(", ") : "—"}</Fact>
        <Fact label="Countries">{provider.supportedCountries.length ? provider.supportedCountries.join(", ") : "Any"}</Fact>
        <Fact label={publicKeyLabel}>
          <span className="font-mono text-xs break-all">{provider.publicKey ?? "—"}</span>
        </Fact>
        <Fact label={accountLabel}>
          <span className="font-mono text-xs break-all">{provider.accountId ?? "—"}</span>
        </Fact>
        <Fact label="Secret key">
          <SecretStatus configured={provider.secretKeyConfigured} fingerprint={provider.secretKeyFingerprint} />
        </Fact>
        <Fact label="Webhook secret">
          <SecretStatus configured={provider.webhookSecretConfigured} fingerprint={provider.webhookSecretFingerprint} />
        </Fact>
        <Fact label="Last webhook">{formatWhen(provider.lastWebhookAt)}</Fact>
        <Fact label="Last failed webhook">{formatWhen(provider.lastWebhookFailureAt)}</Fact>
      </dl>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">Webhook URL — register this at {name} ({provider.environment} mode)</span>
        <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1">
          <code className="min-w-0 flex-1 truncate text-xs text-zinc-200">{webhookUrl}</code>
          <CopyButton value={webhookUrl} label="Copy webhook URL" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
        <ProviderSettingsDialog provider={provider} name={name} publicKeyLabel={publicKeyLabel} accountLabel={accountLabel} />
        <ProviderSecretsDialog provider={provider} name={name} />
      </div>
    </Panel>
  );
}

function SecretStatus({ configured, fingerprint }: { configured: boolean; fingerprint: string | null }) {
  if (!configured) return <Badge variant="secondary">Not configured</Badge>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant="success">Configured</Badge>
      {fingerprint ? <span className="font-mono text-xs text-zinc-500">fingerprint {fingerprint}</span> : null}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </div>
  );
}
