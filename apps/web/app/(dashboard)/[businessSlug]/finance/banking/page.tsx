import Link from "next/link";
import { notFound } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listBankAccounts } from "@cofounderai/module-gst/lib/accounting/banking-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { BankAccountsView } from "@cofounderai/module-gst/components/accounting/bank-accounts-view";
import { createBankAccountAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

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
        actions={
          <>
            {/* FIN-8: where statement lines are categorised from. */}
            <Button asChild size="sm" variant="outline">
              <Link href={`/${businessSlug}/finance/banking/rules`}>
                <Wand2 className="size-4" aria-hidden="true" />
                Bank rules
              </Link>
            </Button>
            <ExportMenu exportId="finance.bank-accounts" businessSlug={businessSlug} />
          </>
        }
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
