import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listBankAccounts } from "@cofounderai/module-gst/lib/accounting/banking-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { BankAccountsView } from "@cofounderai/module-gst/components/accounting/bank-accounts-view";
import { createBankAccountAction } from "./actions";

/** Finance F3 — the accounts money actually moves through. */
export default async function FinanceBankingPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [accounts, ledgerAccounts, canManage] = await Promise.all([
    listBankAccounts(businessId),
    listAccounts(businessId),
    hasPermission(businessId, "gst.banking.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Banking"
        description="Your bank and cash accounts. Import a statement and Finance will suggest which ledger entry each line belongs to."
      />
      <BankAccountsView
        accounts={accounts}
        ledgerAccounts={ledgerAccounts.filter((a) => a.is_active && a.type === "asset")}
        basePath={`/${businessSlug}/finance/banking`}
        canManage={canManage}
        createAction={createBankAccountAction.bind(null, businessId)}
      />
    </div>
  );
}
