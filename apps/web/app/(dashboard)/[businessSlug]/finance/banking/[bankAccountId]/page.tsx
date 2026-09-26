import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import {
  getUnmatchedWithSuggestions,
  listBankAccounts,
  listBankTransactions,
} from "@cofounderai/module-gst/lib/accounting/banking-queries";
import { ledgerAmount } from "@cofounderai/module-gst/lib/accounting/money";
import { listBankRules } from "@cofounderai/module-gst/lib/accounting/bank-rule-queries";
import { findMatchingRule } from "@cofounderai/module-gst/lib/accounting/bank-rules";
import { BankImportForm } from "@cofounderai/module-gst/components/accounting/bank-import-form";
import { BankTransactionsView } from "@cofounderai/module-gst/components/accounting/bank-transactions-view";
import { ReconcileForm } from "@cofounderai/module-gst/components/accounting/reconcile-form";
import {
  categoriseBankTransactionAction,
  ignoreBankTransactionAction,
  importBankStatementAction,
  matchBankTransactionAction,
  reconcileAction,
  unmatchBankTransactionAction,
} from "../actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * One bank account: import its statement, match its lines, reconcile it.
 *
 * All three on one page rather than a wizard, because they are one loop someone runs
 * monthly and stepping between pages loses the context each step needs — you match
 * against what you just imported, and reconcile against what you just matched.
 */
export default async function BankAccountPage({
  params,
}: {
  params: Promise<{ businessSlug: string; bankAccountId: string }>;
}) {
  const { businessSlug, bankAccountId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const accounts = await listBankAccounts(businessId);
  const account = accounts.find((a) => a.id === bankAccountId);
  if (!account) notFound();

  const [transactions, unmatched, canManage, canPost, rules] = await Promise.all([
    listBankTransactions(businessId, bankAccountId),
    getUnmatchedWithSuggestions(businessId, bankAccountId, account.ledger_account_id),
    hasPermission(businessId, "gst.banking.manage"),
    hasPermission(businessId, "gst.journal.create"),
    listBankRules(businessId),
  ]);

  // FIN-8: the rule that fits each unmatched line, if any. Suggested only — applying it is
  // a click, and the action re-derives the rule server-side rather than trusting this.
  const ruleSuggestions: Record<string, { ruleName: string; accountLabel: string }> = {};
  for (const { transaction } of unmatched) {
    const rule = findMatchingRule(rules, { description: transaction.description, amount: transaction.amount });
    if (rule) ruleSuggestions[transaction.id] = { ruleName: rule.name, accountLabel: rule.accountLabel };
  }

  const settled = transactions.filter((t) => t.status !== "unmatched");
  const basePath = `/${businessSlug}/finance`;
  const dates = transactions.map((t) => t.txn_date).sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={account.name}
        description={[account.bank_name, account.account_number_last4 ? `····${account.account_number_last4}` : null]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[{ label: "Banking", href: `${basePath}/banking` }, { label: account.name }]}
        actions={<ExportMenu exportId="finance.bank-transactions" businessSlug={businessSlug} params={{ bankAccountId }} />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Balance per statement"
          value={ledgerAmount.format(account.statementBalance)}
          detail="Opening balance plus every imported line"
          tone="primary"
        />
        <StatCard
          label="Lines to match"
          value={account.unmatchedCount}
          tone={account.unmatchedCount > 0 ? "warning" : "success"}
        />
        <StatCard label="Lines imported" value={account.transactionCount} tone="primary" />
      </div>

      {account.ledger_account_id ? null : (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-subtle">
          This account isn&apos;t linked to a ledger account yet, so Finance has nothing to match
          its lines against. Link it from the chart of accounts.
        </p>
      )}

      {canManage ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BankImportForm action={importBankStatementAction.bind(null, businessId, bankAccountId)} />
          <ReconcileForm
            unmatchedCount={account.unmatchedCount}
            defaultStart={dates[0] ?? today}
            defaultEnd={dates[dates.length - 1] ?? today}
            action={reconcileAction.bind(null, businessId, bankAccountId)}
          />
        </div>
      ) : null}

      <BankTransactionsView
        unmatched={unmatched}
        settled={settled}
        journalPath={`${basePath}/journal`}
        canManage={canManage}
        ruleSuggestions={ruleSuggestions}
        canCategorise={canManage && canPost && Boolean(account.ledger_account_id)}
        categoriseAction={categoriseBankTransactionAction.bind(null, businessId, bankAccountId)}
        matchAction={matchBankTransactionAction.bind(null, businessId, bankAccountId)}
        unmatchAction={unmatchBankTransactionAction.bind(null, businessId, bankAccountId)}
        ignoreAction={ignoreBankTransactionAction.bind(null, businessId, bankAccountId)}
      />
    </div>
  );
}
