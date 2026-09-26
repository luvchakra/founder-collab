import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getReceivables } from "@cofounderai/module-gst/lib/accounting/receivables-queries";
import { ReceivablesView } from "@cofounderai/module-gst/components/accounting/receivables-view";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * Finance — receivables: who owes what, and how late.
 *
 * Derived from `core.documents` and `core.payment_allocations` rather than from the
 * ledger's own Accounts Receivable balance. The two agree, but this one can name the
 * invoice and the customer, which is what makes the number actionable rather than just
 * true.
 */
export default async function FinanceReceivablesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const ledger = await getReceivables(businessId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Receivables"
        description="Every invoice still owed to you, oldest first. Payments and credit notes are already netted off."
        actions={<ExportMenu exportId="finance.receivables" businessSlug={businessSlug} />}
      />
      <ReceivablesView ledger={ledger} />
    </div>
  );
}
