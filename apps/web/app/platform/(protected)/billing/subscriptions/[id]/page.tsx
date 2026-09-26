import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformSubscription } from "@cofounderai/core/admin/platform-billing-ops";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  EmptyState,
  EnvironmentBadge,
  EventStatusBadge,
  Panel,
  PaymentStatusBadge,
  ProviderLabel,
  SubscriptionStatusBadge,
  formatMoney,
  formatWhen,
} from "../../billing-ui";
import { SubscriptionActions } from "./subscription-actions";

/**
 * BILL-27/BILL-31 -- one subscription (§37, §45, §46): its facts, the licences it grants,
 * its payments and webhook events, and the admin operations (compare with the provider,
 * apply the provider's state, re-run licence reconciliation, cancel).
 */
export default async function PlatformBillingSubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sub = await getPlatformSubscription(id);
  if (!sub) notFound();

  const hasProviderRecord = sub.provider !== "internal" && Boolean(sub.providerSubscriptionId);
  const cancellable = !["cancelled", "expired"].includes(sub.status);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/platform/billing/subscriptions" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Subscriptions
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{sub.businessName}</h2>
          <SubscriptionStatusBadge status={sub.status} label={sub.statusLabel} />
        </div>
        <SubscriptionActions
          subscriptionId={sub.id}
          provider={sub.provider}
          hasProviderRecord={hasProviderRecord}
          cancellable={cancellable}
          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
        />
      </div>

      <Panel title="Subscription">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Plan">
            {sub.planName}
            {sub.planKey ? <span className="text-zinc-500"> ({sub.planKey})</span> : null}
          </Fact>
          <Fact label="Pending plan change">{sub.pendingPlanName ?? "—"}</Fact>
          <Fact label="Provider">
            <span className="flex items-center gap-2">
              <ProviderLabel provider={sub.provider} />
              {sub.provider !== "internal" ? <EnvironmentBadge environment={sub.environment} /> : null}
            </span>
          </Fact>
          <Fact label="Provider subscription id">
            <span className="font-mono text-xs break-all">{sub.providerSubscriptionId ?? "—"}</span>
          </Fact>
          <Fact label="Provider status">{sub.providerStatus ?? "—"}</Fact>
          <Fact label="Amount">
            {formatMoney(sub.amount, sub.currency)}
            {sub.billingInterval ? <span className="text-zinc-500"> / {sub.billingInterval}</span> : null}
          </Fact>
          <Fact label="Current period ends">{formatWhen(sub.currentPeriodEnd)}</Fact>
          <Fact label="Cancel at period end">{sub.cancelAtPeriodEnd ? "Yes" : "No"}</Fact>
          <Fact label="Created">{formatWhen(sub.createdAt)}</Fact>
          <Fact label="Business id">
            <span className="font-mono text-xs break-all">{sub.businessId}</span>
          </Fact>
        </dl>
      </Panel>

      <Panel title="Licences" description="Every module licence this business holds, and whether this subscription owns it.">
        {sub.licenses.length === 0 ? (
          <EmptyState>No licences for this business.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Module</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Source</TableHead>
                <TableHead className="text-zinc-400">Owned by this subscription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sub.licenses.map((l) => (
                <TableRow key={l.moduleKey} className="border-zinc-800 hover:bg-zinc-900/60">
                  <TableCell className="font-medium text-zinc-100">{l.moduleKey}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "active" ? "success" : l.status === "grace" ? "warning" : "secondary"}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-zinc-300">{l.source}</TableCell>
                  <TableCell className="text-zinc-300">{l.ownedByThisSubscription ? "Yes" : "No"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel title="Payments">
        {sub.payments.length === 0 ? (
          <EmptyState>No payments for this subscription yet.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Refunded</TableHead>
                <TableHead className="text-zinc-400">Invoice / payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sub.payments.map((p) => (
                <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-900/60">
                  <TableCell className="whitespace-nowrap text-zinc-300">{formatWhen(p.paidAt ?? p.createdAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-100">{formatMoney(p.amount, p.currency)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                    {p.failureMessage ? <p className="mt-1 text-xs text-red-400">{p.failureMessage}</p> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-zinc-300">{p.refundedAmount > 0 ? formatMoney(p.refundedAmount, p.currency) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-400">{p.invoiceNumber ?? p.providerInvoiceId ?? p.providerPaymentId ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {sub.payments.length > 0 ? (
          <Link href="/platform/billing/payments" className="text-xs text-zinc-400 hover:text-zinc-100">
            Refunds are issued from Payments →
          </Link>
        ) : null}
      </Panel>

      <Panel title="Webhook events">
        {sub.events.length === 0 ? (
          <EmptyState>No webhook events recorded for this subscription.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Received</TableHead>
                <TableHead className="text-zinc-400">Type</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Attempts</TableHead>
                <TableHead className="text-zinc-400">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sub.events.map((e) => (
                <TableRow key={e.id} className="border-zinc-800 hover:bg-zinc-900/60">
                  <TableCell className="whitespace-nowrap text-zinc-300">{formatWhen(e.receivedAt)}</TableCell>
                  <TableCell className="font-mono text-xs text-zinc-200">{e.eventType}</TableCell>
                  <TableCell>
                    <EventStatusBadge status={e.status} />
                  </TableCell>
                  <TableCell className="text-zinc-300">{e.attemptCount}</TableCell>
                  <TableCell className="text-xs text-red-400">{e.errorMessage ?? e.errorCode ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
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
