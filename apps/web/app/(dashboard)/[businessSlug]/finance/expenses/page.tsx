import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listBills, listSuppliers } from "@cofounderai/module-gst/lib/accounting/bill-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { BillsView } from "@cofounderai/module-gst/components/accounting/bills-view";
import { createBillAction } from "../bills/actions";

/** Finance §20 — hand entry for expenses. */
export default async function ExpensesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [bills, suppliers, accounts, canManage] = await Promise.all([
    listBills(businessId, "expense"),
    listSuppliers(businessId),
    listAccounts(businessId),
    hasPermission(businessId, "gst.journal.create"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Expenses" description="Things you paid for that were never stock — rent, software, travel." />
      <BillsView
        kind="expense"
        bills={bills}
        suppliers={suppliers}
        accounts={accounts}
        canManage={canManage}
        createAction={createBillAction.bind(null, businessId)}
      />
    </div>
  );
}
