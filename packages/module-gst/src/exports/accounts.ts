// EXP-FIN-02 -- Chart of Accounts export (/finance/accounts).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAccountRoles, listAccounts, type AccountWithBalance } from "../lib/accounting/queries";
import { ACCOUNT_ROLE_LABEL, ACCOUNT_TYPE_LABEL } from "../components/accounting/labels";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";
import { humanizeCode } from "./labels";

/** The page takes no search params -- the whole chart, as the page lists it. */
export const financeAccountsExport: ExportAdapter<Record<string, never>> = {
  id: "finance.accounts",
  module: FINANCE_LICENCE,
  // The page reads with no permission check (RLS decides); `gst.accounts.write` only
  // gates editing there. See ./shared.ts.
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [accounts, roles, currency] = await Promise.all([
      listAccounts(context.businessId),
      listAccountRoles(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const parent = (a: AccountWithBalance) => (a.parent_account_id ? byId.get(a.parent_account_id) : undefined);

    return {
      module: FINANCE_FILE_MODULE,
      resource: "chart-of-accounts",
      title: "Chart of accounts",
      metadata: { Currency: currency },
      sheets: [
        {
          sheetName: "Chart of accounts",
          rows: accounts,
          columns: [
            { key: "code", header: "Account code", getValue: (a: AccountWithBalance) => a.account_number },
            { key: "name", header: "Account name", getValue: (a: AccountWithBalance) => a.name },
            { key: "type", header: "Type", getValue: (a: AccountWithBalance) => ACCOUNT_TYPE_LABEL[a.type] ?? a.type },
            { key: "subtype", header: "Subtype", getValue: (a: AccountWithBalance) => humanizeCode(a.subtype) },
            {
              key: "role",
              header: "Used for",
              getValue: (a: AccountWithBalance) => (roles.get(a.id) ?? []).map((role) => ACCOUNT_ROLE_LABEL[role] ?? role),
            },
            { key: "parent_code", header: "Parent code", getValue: (a: AccountWithBalance) => parent(a)?.account_number ?? null },
            { key: "parent", header: "Parent account", getValue: (a: AccountWithBalance) => parent(a)?.name ?? null },
            { key: "level", header: "Level", type: "integer", getValue: (a: AccountWithBalance) => a.depth },
            { key: "active", header: "Active", type: "boolean", getValue: (a: AccountWithBalance) => a.is_active },
            { key: "system", header: "System account", type: "boolean", getValue: (a: AccountWithBalance) => a.is_system },
            money("opening_balance", "Opening balance", (a: AccountWithBalance) => a.opening_balance, currency),
            money("balance", "Balance", (a: AccountWithBalance) => a.balance, currency),
          ],
        },
      ],
    };
  },
};
