import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getPayables } from "@cofounderai/module-gst/lib/accounting/payables-queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PayablesView } from "@cofounderai/module-gst/components/accounting/payables-view";
import { payBillsAction } from "./actions";

/**
 * Finance — payables: what this business owes, soonest due first.
 *
 * Reads supplier bills from `core.documents`, the same table invoices live in. That is
 * the whole reason the doc type went there rather than into a Finance-local bills table:
 * payments, parties and allocations all work on them unchanged.
 */
export default async function FinancePayablesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [ledger, canPay] = await Promise.all([
    getPayables(businessId),
    hasPermission(businessId, "gst.journal.create"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payables"
        description="Every supplier bill you still owe, soonest due first. Payments and supplier credits are already netted off."
      />
      <PayablesView ledger={ledger} canPay={canPay} payAction={payBillsAction.bind(null, businessId)} />
    </div>
  );
}
