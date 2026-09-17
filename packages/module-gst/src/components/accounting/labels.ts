import type { AccountRoleKey, AccountType } from "../../lib/accounting/types";

/** Statement-section names as an accountant reads them, in statement order (balance
 * sheet first, then profit and loss) — the order is the object's own key order, which is
 * what every list built from it inherits. */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  cogs: "Cost of sales",
  expense: "Expense",
};

/** What each posting role means in plain language, for the "Used for" column — the role
 * keys themselves are internal names the posting rules resolve by, not something to show
 * a founder. */
export const ACCOUNT_ROLE_LABEL: Record<AccountRoleKey, string> = {
  accounts_receivable: "Money owed to you",
  accounts_payable: "Money you owe",
  bank: "Bank",
  cash: "Cash",
  inventory_asset: "Stock on hand",
  gst_payable: "GST collected",
  input_gst: "GST paid on purchases",
  product_revenue: "Product sales",
  service_revenue: "Service revenue",
  product_cogs: "Cost of goods sold",
};

/** Ledger money: two decimals always, unlike the platform's headline `inr` formatter,
 * which rounds to whole rupees for KPI tiles. A balance that reads ₹1,234 when it is
 * actually ₹1,233.50 will not reconcile against anything. */
export const ledgerAmount = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
