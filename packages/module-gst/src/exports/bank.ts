// EXP-FIN-08 -- Bank / Reconciliation export (/finance/banking and
// /finance/banking/[bankAccountId]).
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import { listBankAccounts, type BankAccountWithPosition } from "../lib/accounting/banking-queries";
import { BANK_TRANSACTION_STATUS_LABEL, humanizeCode } from "./labels";
import { listBankTransactionsForExport, type BankTransactionExportRow } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

/**
 * Nothing here can reach bank credentials: Finance holds none (bank lines arrive by
 * statement import), and the only account identifier kept -- the last four digits the
 * page itself shows -- is the only one exported. The pages read with no permission check;
 * `gst.banking.manage` only enables import, matching and reconciling.
 */

/** /finance/banking -- the accounts and their statement positions, as listed. */
export const financeBankAccountsExport: ExportAdapter<Record<string, never>> = {
  id: "finance.bank-accounts",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [accounts, currency] = await Promise.all([
      listBankAccounts(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);
    return {
      module: FINANCE_FILE_MODULE,
      resource: "bank-accounts",
      title: "Bank accounts",
      metadata: { Currency: currency },
      sheets: [
        {
          sheetName: "Bank accounts",
          rows: accounts,
          columns: [
            { key: "name", header: "Bank account", getValue: (a: BankAccountWithPosition) => a.name },
            { key: "bank", header: "Bank", getValue: (a: BankAccountWithPosition) => a.bank_name },
            {
              key: "last4",
              header: "Account number (last 4)",
              getValue: (a: BankAccountWithPosition) => a.account_number_last4,
            },
            { key: "type", header: "Account type", getValue: (a: BankAccountWithPosition) => humanizeCode(a.account_type) },
            { key: "linked", header: "Linked to ledger", type: "boolean", getValue: (a: BankAccountWithPosition) => a.ledger_account_id !== null },
            money("opening", "Opening balance", (a: BankAccountWithPosition) => a.opening_balance, currency),
            money("statement", "Balance per statement", (a: BankAccountWithPosition) => a.statementBalance, currency),
            { key: "lines", header: "Lines imported", type: "integer", getValue: (a: BankAccountWithPosition) => a.transactionCount },
            { key: "unmatched", header: "Lines to match", type: "integer", getValue: (a: BankAccountWithPosition) => a.unmatchedCount },
            { key: "active", header: "Active", type: "boolean", getValue: (a: BankAccountWithPosition) => a.is_active },
          ],
        },
      ],
    };
  },
};

type TxnFilters = { bankAccountId: string };

/**
 * /finance/banking/[bankAccountId] -- one account's statement lines with their
 * reconciliation state. The page shows the 200 most recent lines and does not paginate;
 * the export is every line (`listBankTransactionsForExport`, same predicates, paged).
 *
 * The account id is a route segment, so the button passes it as a param -- and exactly as
 * the page does, it is only honoured if it is one of *this* business's accounts
 * (`listBankAccounts(context.businessId)`); anything else is a 404.
 *
 * Statement convention: a debit is money out of the account, a credit money in. The
 * stored line carries no separate value date, so there is no value-date column.
 */
export const financeBankTransactionsExport: ExportAdapter<TxnFilters> = {
  id: "finance.bank-transactions",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: (params) => ({ bankAccountId: params.get("bankAccountId") ?? "" }),
  async load(context, filters) {
    const accounts = await listBankAccounts(context.businessId);
    const account = accounts.find((a) => a.id === filters.bankAccountId);
    if (!account) throw new ExportDeniedError("Bank account not found.", 404);

    const [lines, currency] = await Promise.all([
      listBankTransactionsForExport(context.businessId, account.id),
      getLedgerCurrency(context.businessId),
    ]);

    return {
      module: FINANCE_FILE_MODULE,
      resource: "bank-transactions",
      title: `Bank statement lines: ${account.name}`,
      metadata: {
        "Bank account": account.name,
        ...(account.account_number_last4 ? { "Account number (last 4)": account.account_number_last4 } : {}),
        Currency: currency,
      },
      sheets: [
        {
          sheetName: "Statement lines",
          rows: lines,
          columns: [
            { key: "account", header: "Bank account", getValue: () => account.name },
            { key: "date", header: "Transaction date", type: "date", getValue: (t: BankTransactionExportRow) => t.txn_date },
            { key: "description", header: "Description", getValue: (t: BankTransactionExportRow) => t.description },
            { key: "reference", header: "Reference", getValue: (t: BankTransactionExportRow) => t.reference },
            money("debit", "Debit (money out)", (t: BankTransactionExportRow) => (t.amount < 0 ? -t.amount : null), currency),
            money("credit", "Credit (money in)", (t: BankTransactionExportRow) => (t.amount > 0 ? t.amount : null), currency),
            money("balance", "Balance", (t: BankTransactionExportRow) => t.balance_after, currency),
            {
              key: "state",
              header: "Reconciliation state",
              getValue: (t: BankTransactionExportRow) => BANK_TRANSACTION_STATUS_LABEL[t.status] ?? t.status,
            },
            { key: "matched", header: "Matched journal entry", getValue: (t: BankTransactionExportRow) => t.matchedEntryNumber },
          ],
        },
      ],
    };
  },
};
