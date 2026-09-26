import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import {
  getAccountTypeTotals,
  listAccountRoles,
  listAccounts,
} from "@cofounderai/module-gst/lib/accounting/queries";
import { ChartOfAccountsView } from "@cofounderai/module-gst/components/accounting/chart-of-accounts-view";
import {
  createAccountAction,
  provisionChartOfAccountsAction,
  updateAccountAction,
} from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * Finance F2 — the Chart of Accounts: the ledger structure everything else in Finance
 * posts into, and the first screen a business sees after activating the module.
 *
 * Read access is RLS's call (`tenant AND licensed`), so an unlicensed or non-member
 * request simply finds no accounts here; `gst.accounts.write` is what separates looking
 * from editing, and is passed down rather than re-checked in the view.
 */
export default async function FinanceAccountsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [accounts, totals, roles, canEdit] = await Promise.all([
    listAccounts(businessId),
    getAccountTypeTotals(businessId),
    listAccountRoles(businessId),
    hasPermission(businessId, "gst.accounts.write"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Chart of accounts"
        description="Every account your books are kept in, and what each one currently holds. Invoices, bills and payments post here automatically."
        actions={<ExportMenu exportId="finance.accounts" businessSlug={businessSlug} />}
      />

      <ChartOfAccountsView
        accounts={accounts}
        totals={totals}
        rolesByAccount={Object.fromEntries(roles)}
        canEdit={canEdit}
        provisionAction={provisionChartOfAccountsAction.bind(null, businessId)}
        createAction={createAccountAction.bind(null, businessId)}
        updateAction={updateAccountAction.bind(null, businessId)}
      />
    </div>
  );
}
