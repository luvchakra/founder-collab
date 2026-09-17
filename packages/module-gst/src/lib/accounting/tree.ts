import type { AccountType } from "./types";

export interface AccountRow {
  id: string;
  account_number: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  parent_account_id: string | null;
  is_active: boolean;
  is_system: boolean;
  opening_balance: number;
}

export interface AccountWithBalance extends AccountRow {
  /** Derived from posted journal lines plus the opening balance (gst.account_balances),
   * signed so a "normal" balance reads positive whichever side that is. */
  balance: number;
  /** How deep in the account tree, for indenting the hierarchy in the UI. */
  depth: number;
}

export interface AccountTypeTotal {
  type: AccountType;
  total: number;
}

/**
 * Orders a flat list of accounts as a tree: each parent immediately followed by its own
 * children, and depth recorded so the UI can indent rather than nest.
 *
 * Pure, and separate from the query that fetches the rows, because the ordering is the
 * part with rules worth stating: what happens to an account whose parent is missing, and
 * what happens if the parent chain loops.
 */
export function orderAccountTree(
  rows: AccountRow[],
  balanceByAccount: Map<string, number>,
): AccountWithBalance[] {
  const childrenOf = new Map<string | null, AccountRow[]>();
  for (const row of rows) {
    const siblings = childrenOf.get(row.parent_account_id) ?? [];
    siblings.push(row);
    childrenOf.set(row.parent_account_id, siblings);
  }

  const withBalance = (row: AccountRow, depth: number): AccountWithBalance => ({
    ...row,
    opening_balance: Number(row.opening_balance ?? 0),
    balance: balanceByAccount.get(row.id) ?? Number(row.opening_balance ?? 0),
    depth,
  });

  // Depth-first from the roots so the list reads top-down as the tree looks. Guarded
  // against a cycle: the database forbids self-parenting, but a longer loop would
  // otherwise hang the request rather than render a slightly wrong tree.
  const out: AccountWithBalance[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const row of childrenOf.get(parentId) ?? []) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(withBalance(row, depth));
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);

  // An account orphaned by a parent the caller cannot see (or caught in a cycle) still
  // belongs in the list -- dropping it would silently hide an account holding a balance.
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    out.push(withBalance(row, 0));
  }

  return out;
}

/**
 * Section totals for the statement summary.
 *
 * Leaf accounts only: a parent in this chart is a heading whose figure is the sum of its
 * children, so counting both would report every section at double its real size.
 */
export function sumByType(accounts: AccountWithBalance[]): AccountTypeTotal[] {
  const parents = new Set(
    accounts.map((a) => a.parent_account_id).filter((id): id is string => id !== null),
  );
  const totals = new Map<AccountType, number>();
  for (const account of accounts) {
    if (parents.has(account.id)) continue;
    totals.set(account.type, (totals.get(account.type) ?? 0) + account.balance);
  }
  return [...totals.entries()].map(([type, total]) => ({ type, total: Math.round(total * 100) / 100 }));
}
