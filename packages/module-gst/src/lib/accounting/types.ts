/** The six statement sections a Chart of Accounts is organised into. `cogs` is separate
 * from `expense` because gross margin (revenue - COGS) is its own reported number, not a
 * filter over one undifferentiated expense bucket. */
export type AccountType = "asset" | "liability" | "equity" | "income" | "cogs" | "expense";

/** Which side increases an account of this type. Assets and costs are debit-normal;
 * liabilities, equity and income are credit-normal. This is the whole of double-entry
 * sign convention, in one place, so no call site has to re-derive it. */
export type NormalBalance = "debit" | "credit";

export interface AccountSeed {
  accountNumber: string;
  name: string;
  type: AccountType;
  /** Parent's `accountNumber`, or null for a top-level section. */
  parent: string | null;
  /** A system account is one the posting engine resolves by role. It can be renamed but
   * never deactivated, or automatic posting loses its target. */
  isSystem: boolean;
}

/** Stable role keys the posting rules ask for by name, resolved per business through
 * `gst.account_mappings` to whichever account that business actually uses. */
export type AccountRoleKey =
  | "accounts_receivable"
  | "accounts_payable"
  | "bank"
  | "cash"
  | "inventory_asset"
  | "gst_payable"
  | "input_gst"
  | "product_revenue"
  | "service_revenue"
  | "product_cogs";

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
}
