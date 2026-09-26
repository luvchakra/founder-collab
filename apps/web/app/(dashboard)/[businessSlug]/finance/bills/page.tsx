import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listBills, listSuppliers } from "@cofounderai/module-gst/lib/accounting/bill-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { BillsView } from "@cofounderai/module-gst/components/accounting/bills-view";
import { createBillAction } from "../bills/actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/** Finance §19 — hand entry for bills. */
export default async function BillsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [bills, suppliers, accounts, canManage] = await Promise.all([
    listBills(businessId, "bill"),
    listSuppliers(businessId),
    listAccounts(businessId),
    hasPermission(businessId, "gst.journal.create"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bills"
        description="What your suppliers have invoiced you. Each one posts to your ledger and shows in Payables until it's paid."
        actions={<ExportMenu exportId="finance.bills" businessSlug={businessSlug} />}
      />
      <BillsView
        kind="bill"
        bills={bills}
        suppliers={suppliers}
        accounts={accounts}
        canManage={canManage}
        createAction={createBillAction.bind(null, businessId)}
      />
    </div>
  );
}
