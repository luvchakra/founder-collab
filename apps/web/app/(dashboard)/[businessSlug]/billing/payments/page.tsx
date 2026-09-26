import { notFound, redirect } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { canManageBilling, listBusinessPayments } from "@cofounderai/core/billing/overview";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { BillingTabs, formatDay, formatMoney, PaymentStatusBadge } from "../billing-ui";
import { ManageBillingButton } from "../manage-buttons";

/**
 * BILL-20 -- payment history (§76). Account owners and admins only (RLS on
 * platform.billing_payments enforces it; this page just doesn't pretend otherwise).
 * Invoices live at the provider and are opened through "Manage billing" -- no long-lived
 * signed invoice URL is stored (§55).
 */
export default async function PaymentsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();
  if (!(await canManageBilling(businessId))) redirect(`/${businessSlug}/billing`);
  const payments = await listBusinessPayments(businessId);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
      <PageHeader
        title="Payment history"
        description="Every payment for this business's subscription."
        breadcrumbs={[{ label: business.name, href: `/${businessSlug}/business` }, { label: "Billing", href: `/${businessSlug}/billing` }, { label: "Payments" }]}
        actions={payments.length > 0 ? <ManageBillingButton businessSlug={businessSlug} label="View invoices" variant="outline" /> : null}
      />
      <BillingTabs businessSlug={businessSlug} active="/payments" />
      {payments.length === 0 ? (
        <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{formatDay(p.paidAt ?? p.failedAt ?? p.createdAt)}</TableCell>
                  <TableCell>
                    {p.description ?? "Subscription payment"}
                    {p.status === "failed" && p.failureMessage ? <p className="text-xs text-muted-foreground">{p.failureMessage}</p> : null}
                    {p.refundedAmount > 0 ? <p className="text-xs text-muted-foreground">Refunded {formatMoney(p.refundedAmount, p.currency)}</p> : null}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(p.amount, p.currency)}</TableCell>
                  <TableCell>{p.currency}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.invoiceNumber ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
