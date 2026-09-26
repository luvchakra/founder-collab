import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listBankRules } from "@cofounderai/module-gst/lib/accounting/bank-rule-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { listSuppliers } from "@cofounderai/module-gst/lib/accounting/bill-queries";
import { BankRulesView } from "@cofounderai/module-gst/components/accounting/bank-rules-view";
import { deleteBankRuleAction, saveBankRuleAction, setBankRuleActiveAction } from "./actions";

/**
 * FIN-8 — bank rules: where each kind of statement line goes, remembered instead of
 * re-decided every month. Rules only suggest; each bank account's page offers the
 * matching rule on an unmatched line, and a person applies it.
 */
export default async function FinanceBankRulesPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [rules, accounts, parties, canManage] = await Promise.all([
    listBankRules(businessId),
    listAccounts(businessId),
    listSuppliers(businessId),
    hasPermission(businessId, "gst.bank_rules.manage"),
  ]);
  const basePath = `/${businessSlug}/finance`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bank rules"
        description="Tell Finance where a kind of bank line belongs once, and it suggests it on every statement after. Rules are tried in order; the first that fits wins."
        breadcrumbs={[{ label: "Banking", href: `${basePath}/banking` }, { label: "Bank rules" }]}
      />
      <BankRulesView
        rules={rules}
        accounts={accounts
          .filter((a) => a.is_active)
          .map((a) => ({ id: a.id, label: `${a.account_number} — ${a.name}` }))}
        parties={parties.map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManage}
        saveAction={saveBankRuleAction.bind(null, businessId)}
        setActiveAction={setBankRuleActiveAction.bind(null, businessId)}
        deleteAction={deleteBankRuleAction.bind(null, businessId)}
      />
    </div>
  );
}
