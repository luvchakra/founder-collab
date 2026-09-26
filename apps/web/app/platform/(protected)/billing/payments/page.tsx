import Link from "next/link";
import { listPlatformPayments } from "@cofounderai/core/admin/platform-billing-ops";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import {
  EmptyState,
  EnvironmentBadge,
  FilterBar,
  FilterSelect,
  PAYMENT_STATUSES,
  PROVIDER_OPTIONS,
  PaymentStatusBadge,
  ProviderLabel,
  formatMoney,
  formatWhen,
  pickParam,
} from "../billing-ui";
import { RefundDialog } from "./refund-dialog";

/**
 * BILL-28 -- every captured/attempted payment, newest first (§38), with provider-driven
 * refunds (§78): the refund is requested from the provider and the row only turns
 * refunded when the provider confirms it.
 */
export default async function PlatformBillingPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = pickParam(params.status, PAYMENT_STATUSES);
  const provider = pickParam(params.provider, ["razorpay", "stripe"] as const);
  const payments = await listPlatformPayments({ status, provider });
  const filtered = Boolean(status || provider);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar resetHref="/platform/billing/payments">
        <FilterSelect name="status" label="Status" value={status} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
        <FilterSelect name="provider" label="Provider" value={provider} options={PROVIDER_OPTIONS} />
      </FilterBar>

      <p className="text-xs text-zinc-500">
        Refunds are requested from the provider. A payment is marked refunded only once the provider confirms the refund.
      </p>

      {payments.length === 0 ? (
        <EmptyState>{filtered ? "No payments match these filters." : "No payments yet."}</EmptyState>
      ) : (
        <div className="rounded-2xl border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Date</TableHead>
                <TableHead className="text-zinc-400">Business</TableHead>
                <TableHead className="text-zinc-400">Provider</TableHead>
                <TableHead className="text-zinc-400">Amount</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Method</TableHead>
                <TableHead className="text-zinc-400">Invoice / payment</TableHead>
                <TableHead className="text-right text-zinc-400">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const remaining = Math.max(0, Math.round((p.amount - p.refundedAmount) * 100) / 100);
                const refundable = (p.status === "succeeded" || p.status === "partially_refunded") && Boolean(p.providerPaymentId) && remaining > 0;
                return (
                  <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="whitespace-nowrap text-zinc-300">{formatWhen(p.paidAt ?? p.createdAt)}</TableCell>
                    <TableCell className="text-zinc-100">
                      {p.subscriptionId ? (
                        <Link href={`/platform/billing/subscriptions/${p.subscriptionId}`} className="hover:underline">
                          {p.businessName}
                        </Link>
                      ) : (
                        p.businessName
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      <div className="flex items-center gap-2">
                        <ProviderLabel provider={p.provider} />
                        <EnvironmentBadge environment={p.environment} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-zinc-100">
                      {formatMoney(p.amount, p.currency)}
                      {p.taxAmount ? <p className="text-xs text-zinc-500">incl. tax {formatMoney(p.taxAmount, p.currency)}</p> : null}
                      {p.refundedAmount > 0 ? <p className="text-xs text-amber-300">refunded {formatMoney(p.refundedAmount, p.currency)}</p> : null}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                      {p.failureMessage || p.failureCode ? <p className="mt-1 max-w-56 text-xs text-red-400">{p.failureMessage ?? p.failureCode}</p> : null}
                    </TableCell>
                    <TableCell className="text-zinc-300">{p.methodType ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">
                      {p.invoiceNumber ?? p.providerInvoiceId ?? "—"}
                      {p.providerPaymentId ? <p className="text-zinc-500">{p.providerPaymentId}</p> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {refundable ? (
                        <RefundDialog
                          paymentId={p.id}
                          businessName={p.businessName}
                          amountLabel={formatMoney(p.amount, p.currency)}
                          remainingLabel={formatMoney(remaining, p.currency)}
                          remaining={remaining}
                          currency={p.currency}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {payments.length >= 200 ? <p className="text-xs text-zinc-500">Showing the 200 most recent. Narrow the filters to see older ones.</p> : null}
    </div>
  );
}
