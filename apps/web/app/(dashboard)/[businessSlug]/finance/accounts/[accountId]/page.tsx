import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getAccountLedger } from "@cofounderai/module-gst/lib/accounting/account-ledger-queries";
import { resolveReportRange } from "@cofounderai/module-gst/exports/periods";
import { AccountLedgerView } from "@cofounderai/module-gst/components/accounting/account-ledger-view";
import { ReportPeriodCaption } from "@cofounderai/module-gst/components/accounting/financial-statements";

/**
 * FIN-7 — report drill-down: the transactions behind one account's figure on a statement,
 * for the statement's own period (`from`/`to` in the URL, defaulting to fiscal year to
 * date exactly as the reports page does). An account from another business is a 404.
 */
export default async function FinanceAccountLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; accountId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { businessSlug, accountId } = await params;
  const { from: fromParam, to: toParam } = await searchParams;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const { from, to } = await resolveReportRange(businessId, fromParam ?? "", toParam ?? "");
  const ledger = await getAccountLedger(businessId, accountId, from, to);
  if (!ledger) notFound();

  const basePath = `/${businessSlug}/finance`;
  const title = `${ledger.account.accountNumber} ${ledger.account.name}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description="Every posting to this account in the period, with the running balance."
        breadcrumbs={[
          { label: "Financial reports", href: `${basePath}/reports?from=${from}&to=${to}` },
          { label: title },
        ]}
        actions={
          <Link href={`${basePath}/accounts`} className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Chart of accounts
          </Link>
        }
      />
      <ReportPeriodCaption from={from} to={to} />
      <AccountLedgerView ledger={ledger} journalPath={`${basePath}/journal`} documentPath={`${basePath}/documents`} />
    </div>
  );
}
