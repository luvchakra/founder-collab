import type { AccountRoleKey, AccountSeed } from "./types";

/**
 * The default Chart of Accounts a business starts with, as specified by the Finance
 * requirements. Deliberately small: enough to post everything the operational modules
 * actually produce (sales, purchases, GST, bank, payroll-free expenses) without
 * pre-inventing accounts nobody has a transaction for.
 *
 * Numbering follows the conventional blocks -- 1000s assets, 2000s liabilities, 3000s
 * equity, 4000s income, 5000s COGS, 6000s expenses -- so an accountant recognises the
 * layout immediately and there is room to insert accounts between them.
 *
 * `isSystem` marks the accounts the posting engine resolves by role. Those can be
 * renamed to match a business's own vocabulary but never deactivated, since automatic
 * posting would then have no target.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: AccountSeed[] = [
  { accountNumber: "1000", name: "Assets", type: "asset", parent: null, isSystem: true },
  { accountNumber: "1100", name: "Bank", type: "asset", parent: "1000", isSystem: true },
  { accountNumber: "1200", name: "Cash", type: "asset", parent: "1000", isSystem: true },
  { accountNumber: "1300", name: "Accounts Receivable", type: "asset", parent: "1000", isSystem: true },
  { accountNumber: "1400", name: "Inventory Asset", type: "asset", parent: "1000", isSystem: true },
  { accountNumber: "1500", name: "Fixed Assets", type: "asset", parent: "1000", isSystem: false },
  { accountNumber: "1600", name: "Other Current Assets", type: "asset", parent: "1000", isSystem: false },
  // Input tax credit gets its own account rather than sharing "Other Current Assets":
  // the ITC figure is only reportable if it is separable from every other current asset,
  // and as the target of automatic purchase postings it must be a system account so it
  // cannot be switched off underneath them.
  { accountNumber: "1700", name: "Input GST", type: "asset", parent: "1000", isSystem: true },

  { accountNumber: "2000", name: "Liabilities", type: "liability", parent: null, isSystem: true },
  { accountNumber: "2100", name: "Accounts Payable", type: "liability", parent: "2000", isSystem: true },
  { accountNumber: "2200", name: "GST Payable", type: "liability", parent: "2000", isSystem: true },
  { accountNumber: "2300", name: "TDS Payable", type: "liability", parent: "2000", isSystem: false },
  { accountNumber: "2400", name: "Loans", type: "liability", parent: "2000", isSystem: false },
  { accountNumber: "2500", name: "Other Liabilities", type: "liability", parent: "2000", isSystem: false },

  { accountNumber: "3000", name: "Equity", type: "equity", parent: null, isSystem: true },
  { accountNumber: "3100", name: "Owner Capital", type: "equity", parent: "3000", isSystem: false },
  { accountNumber: "3200", name: "Retained Earnings", type: "equity", parent: "3000", isSystem: true },
  { accountNumber: "3300", name: "Drawings", type: "equity", parent: "3000", isSystem: false },

  { accountNumber: "4000", name: "Income", type: "income", parent: null, isSystem: true },
  { accountNumber: "4100", name: "Product Sales", type: "income", parent: "4000", isSystem: true },
  { accountNumber: "4200", name: "Service Revenue", type: "income", parent: "4000", isSystem: true },
  { accountNumber: "4300", name: "Other Income", type: "income", parent: "4000", isSystem: false },

  { accountNumber: "5000", name: "Cost of Goods Sold", type: "cogs", parent: null, isSystem: true },
  { accountNumber: "5100", name: "Product COGS", type: "cogs", parent: "5000", isSystem: true },
  { accountNumber: "5200", name: "Materials", type: "cogs", parent: "5000", isSystem: false },
  { accountNumber: "5300", name: "Direct Costs", type: "cogs", parent: "5000", isSystem: false },

  { accountNumber: "6000", name: "Expenses", type: "expense", parent: null, isSystem: true },
  { accountNumber: "6100", name: "Salaries", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6200", name: "Rent", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6300", name: "Utilities", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6400", name: "Marketing", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6500", name: "Software", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6600", name: "Travel", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6700", name: "Professional Fees", type: "expense", parent: "6000", isSystem: false },
  { accountNumber: "6800", name: "Other Expenses", type: "expense", parent: "6000", isSystem: false },
];

/**
 * Which default account each posting role resolves to on a fresh chart. A business can
 * re-point any of these afterwards (that is what `gst.account_mappings` is for); this is
 * only the starting position, so a newly activated Finance module can post immediately
 * rather than demanding the founder map ten accounts before their first invoice.
 *
 * Input GST is an asset, not a reduction of the GST Payable liability: input tax credit
 * is receivable from the tax authority until it is actually offset, and keeping it on
 * its own account is what makes the ITC figure reportable at all.
 */
export const DEFAULT_ACCOUNT_ROLES: Record<AccountRoleKey, string> = {
  accounts_receivable: "1300",
  accounts_payable: "2100",
  bank: "1100",
  cash: "1200",
  inventory_asset: "1400",
  gst_payable: "2200",
  input_gst: "1700",
  product_revenue: "4100",
  service_revenue: "4200",
  product_cogs: "5100",
};
