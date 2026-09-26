import type { ReactNode } from "react";
import Link from "next/link";
import { getApiPolicy, getApiUsageSummary, listPlatformApiKeys, type PlatformApiKey } from "@cofounderai/core/admin/platform-api-admin";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { PlatformImpactBanner } from "../../impact-banner";
import { ReasonActionDialog } from "../../reason-action-dialog";
import { KpiCard, Panel, formatWhen } from "../billing/billing-ui";
import { revokePlatformApiKeyAction } from "./actions";
import { ApiPolicyDialog } from "./api-policy-dialog";

/**
 * PLATFORM-P1-06.1/06.2/06.3/06.4 ("Platform API Administration", §28): the API and webhook
 * policy the public API and billing webhooks enforce, aggregate API usage, and every
 * business's API keys (metadata only) with an audited revoke. Tables on desktop, stacked
 * rows on mobile (PLATFORM-P0-19.3/19.4).
 */
export default async function PlatformApiPage() {
  const [policy, usage, keys] = await Promise.all([getApiPolicy(), getApiUsageSummary(), listPlatformApiKeys()]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">API</h1>
        <p className="text-sm text-zinc-400">Rate, burst and payload limits for the public API, the policy for incoming webhooks, and platform-wide API usage.</p>
      </div>

      <PlatformImpactBanner description="These limits apply to every business's API keys and to every incoming webhook." />

      <Panel title="Policy" description={policy.updatedAt ? `Last changed ${formatWhen(policy.updatedAt)}` : undefined} action={<ApiPolicyDialog policy={policy} />}>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Item label="Rate limit">
            {policy.rateLimitPerMinute} / minute per business{" "}
            <Link href="/platform/system-policies" className="text-xs text-zinc-500 underline hover:text-zinc-200">
              (Platform Policies)
            </Link>
          </Item>
          <Item label="Burst limit">{policy.burstLimitPerSecond} / second per business</Item>
          <Item label="Payload limit">{policy.maxPayloadKb.toLocaleString()} KB per request</Item>
          <Item label="Webhook attempts">{policy.webhookMaxRetries} per event</Item>
          <Item label="Webhook timeout">{policy.webhookTimeoutSeconds.toLocaleString()} s, then retried</Item>
          <Item label="Webhook signatures">Always required · {policy.webhookSignatureToleranceSeconds} s timestamp window</Item>
        </dl>
      </Panel>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase">Usage</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Requests (today)" value={usage.requests24h.toLocaleString()} detail={`${usage.requests7d.toLocaleString()} in 7 days`} />
          <KpiCard label="Rate limited (7d)" value={usage.rateLimited7d.toLocaleString()} tone={usage.rateLimited7d > 0 ? "warning" : undefined} detail="Refused with 429" />
          <KpiCard
            label="Errors (24h)"
            value={(usage.errors24h.clientErrors + usage.errors24h.serverErrors).toLocaleString()}
            tone={usage.errors24h.serverErrors > 0 ? "danger" : undefined}
            detail={`${usage.errors24h.serverErrors} server · ${usage.errors24h.clientErrors} client`}
          />
          <KpiCard label="API keys" value={usage.activeKeys} detail={`${usage.keysUsed7d} used in 7 days`} />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MiniTable title="Requests per day" rows={usage.daily.map((d) => [d.day, d.requests.toLocaleString()])} empty="No requests yet" />
          <MiniTable title="Top businesses (7d)" rows={usage.topBusinesses.map((b) => [b.businessName, b.requests.toLocaleString()])} empty="No requests yet" />
          <MiniTable title="Errors by status (7d)" rows={usage.errorsByStatus7d.map((e) => [String(e.status), e.count.toLocaleString()])} empty="No errors" />
        </div>
      </section>

      <Panel title="Business API keys" description="Every business's keys. Keys and their hashes are never shown.">
        {keys.length === 0 ? (
          <p className="text-sm text-zinc-500">No business has created an API key yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800 md:hidden">
              {keys.map((k) => (
                <li key={k.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-zinc-100">{k.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {k.businessName} · <span className="font-mono">{k.keyPrefix}…</span> · last used {formatWhen(k.lastUsedAt)}
                    </p>
                  </div>
                  {k.revokedAt ? <Badge variant="secondary">Revoked</Badge> : <RevokeKey k={k} />}
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Key</TableHead>
                  <TableHead className="text-zinc-400">Business</TableHead>
                  <TableHead className="text-zinc-400">Permissions</TableHead>
                  <TableHead className="text-zinc-400">Last used</TableHead>
                  <TableHead className="text-right text-zinc-400">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="text-zinc-100">
                      {k.name}
                      <span className="block font-mono text-xs text-zinc-500">{k.keyPrefix}…</span>
                    </TableCell>
                    <TableCell className="text-zinc-300">{k.businessName}</TableCell>
                    <TableCell className="text-zinc-400">{k.permissionCount}</TableCell>
                    <TableCell className="text-xs text-zinc-400">{formatWhen(k.lastUsedAt)}</TableCell>
                    <TableCell className="text-right">{k.revokedAt ? <Badge variant="secondary">Revoked</Badge> : <RevokeKey k={k} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Panel>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs tracking-wide text-zinc-500 uppercase">{label}</dt>
      <dd className="text-zinc-100">{children}</dd>
    </div>
  );
}

function MiniTable({ title, rows, empty }: { title: string; rows: [string, string][]; empty: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <h3 className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <dl className="flex flex-col gap-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="truncate text-zinc-300">{label}</dt>
              <dd className="tabular-nums text-zinc-100">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RevokeKey({ k }: { k: PlatformApiKey }) {
  return (
    <ReasonActionDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          Revoke
        </Button>
      }
      title={`Revoke "${k.name}"?`}
      description={`Requests using this key from ${k.businessName} start failing immediately. The business can issue a new key.`}
      confirmLabel="Revoke key"
      confirmText={k.keyPrefix}
      destructive
      successMessage="API key revoked."
      action={revokePlatformApiKeyAction.bind(null, k.id)}
    />
  );
}
