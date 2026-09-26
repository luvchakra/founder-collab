import Link from "next/link";
import { listPlatformSubscriptions } from "@cofounderai/core/admin/platform-billing-ops";
import { SUBSCRIPTION_STATUS_LABEL } from "@cofounderai/core/billing/state";
import type { SubscriptionStatus } from "@cofounderai/core/billing/subscription-types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  EmptyState,
  EnvironmentBadge,
  FilterBar,
  FilterSearch,
  FilterSelect,
  ProviderLabel,
  SubscriptionStatusBadge,
  formatMoney,
  formatWhen,
  pickParam,
} from "../billing-ui";

/**
 * BILL-27 -- every business's subscription, newest first (§37). Filters are URL search
 * params, validated against the known values before reaching the query.
 */
const STATUSES = Object.keys(SUBSCRIPTION_STATUS_LABEL) as SubscriptionStatus[];
const PROVIDERS = ["razorpay", "stripe", "internal"] as const;

export default async function PlatformBillingSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = pickParam(params.status, STATUSES);
  const provider = pickParam(params.provider, PROVIDERS);
  const rawSearch = Array.isArray(params.search) ? params.search[0] : params.search;
  const search = rawSearch?.trim().slice(0, 200) || undefined;
  const subscriptions = await listPlatformSubscriptions({ status, provider, search });
  const filtered = Boolean(status || provider || search);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar resetHref="/platform/billing/subscriptions">
        <FilterSelect name="status" label="Status" value={status} options={STATUSES.map((s) => ({ value: s, label: SUBSCRIPTION_STATUS_LABEL[s] }))} />
        <FilterSelect
          name="provider"
          label="Provider"
          value={provider}
          options={[
            { value: "razorpay", label: "Razorpay" },
            { value: "stripe", label: "Stripe" },
            { value: "internal", label: "Internal" },
          ]}
        />
        <FilterSearch name="search" label="Business or provider id" value={search} placeholder="Search…" />
      </FilterBar>

      {subscriptions.length === 0 ? (
        <EmptyState>{filtered ? "No subscriptions match these filters." : "No subscriptions yet."}</EmptyState>
      ) : (
        <div className="rounded-2xl border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Business</TableHead>
                <TableHead className="text-zinc-400">Plan</TableHead>
                <TableHead className="text-zinc-400">Provider</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Period ends</TableHead>
                <TableHead className="text-zinc-400">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s) => (
                <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-900/60">
                  <TableCell className="text-zinc-100">
                    <Link href={`/platform/billing/subscriptions/${s.id}`} className="font-medium hover:underline">
                      {s.businessName}
                    </Link>
                    {s.providerSubscriptionId ? <p className="font-mono text-xs text-zinc-500">{s.providerSubscriptionId}</p> : null}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {s.planName}
                    {s.pendingPlanName ? <p className="text-xs text-zinc-500">→ {s.pendingPlanName} next</p> : null}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    <div className="flex items-center gap-2">
                      <ProviderLabel provider={s.provider} />
                      {s.provider !== "internal" ? <EnvironmentBadge environment={s.environment} /> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge status={s.status} label={s.statusLabel} />
                    {s.cancelAtPeriodEnd && s.status !== "cancel_scheduled" ? <p className="mt-1 text-xs text-amber-300">Cancels at period end</p> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-300">
                    {formatMoney(s.amount, s.currency)}
                    {s.billingInterval ? <span className="text-zinc-500"> / {s.billingInterval}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-300">{formatWhen(s.currentPeriodEnd)}</TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-400">{formatWhen(s.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {subscriptions.length >= 200 ? <p className="text-xs text-zinc-500">Showing the 200 most recent. Narrow the filters to see older ones.</p> : null}
    </div>
  );
}
