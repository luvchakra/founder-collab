import { DEFAULT_ACCOUNT_ROLES, DEFAULT_CHART_OF_ACCOUNTS } from "./chart-of-accounts";
import type { AccountRoleKey, AccountSeed } from "./types";

export interface ProvisionPlan {
  /** Seeds to insert, grouped so every batch's parents already exist by the time it
   * runs -- a child's `parent_account_id` is only knowable once its parent has an id. */
  batches: AccountSeed[][];
  /** Roles with no mapping yet, and the account number each should resolve to. */
  roleMappings: { role: AccountRoleKey; accountNumber: string }[];
}

/**
 * Works out what a business is missing from the default Chart of Accounts.
 *
 * Idempotent by account number rather than by an "already provisioned" flag, which is
 * what makes re-running safe: a business that deleted an account it didn't want, or that
 * was set up before a later release added one, gets exactly the missing rows and keeps
 * everything it has renamed or re-pointed. That matters because system accounts can be
 * renamed to a business's own vocabulary -- re-running must not rename them back.
 *
 * Pure, so the ordering and the don't-clobber rules are testable without a database.
 */
export function planProvisioning(
  existingAccountNumbers: Iterable<string>,
  existingRoleKeys: Iterable<string>,
  chart: AccountSeed[] = DEFAULT_CHART_OF_ACCOUNTS,
  roles: Record<string, string> = DEFAULT_ACCOUNT_ROLES,
): ProvisionPlan {
  const have = new Set(existingAccountNumbers);
  const missing = chart.filter((seed) => !have.has(seed.accountNumber));

  // Batch by depth rather than assuming the chart is two levels deep: a seed goes in the
  // first batch whose predecessors are all already placed (or already in the database).
  const batches: AccountSeed[][] = [];
  const placed = new Set(have);
  let remaining = missing;
  while (remaining.length > 0) {
    const ready = remaining.filter((seed) => seed.parent === null || placed.has(seed.parent));
    if (ready.length === 0) {
      // A seed naming a parent that isn't in the chart at all is a bug in the chart, not
      // something to loop forever over -- place the rest at the top level and let the
      // chart's own test catch it.
      batches.push(remaining);
      break;
    }
    batches.push(ready);
    for (const seed of ready) placed.add(seed.accountNumber);
    remaining = remaining.filter((seed) => !placed.has(seed.accountNumber));
  }

  // Only roles with no mapping yet. A business that re-pointed `bank` at its second bank
  // account must keep that choice when this runs again.
  const mapped = new Set(existingRoleKeys);
  const chartNumbers = new Set(chart.map((seed) => seed.accountNumber));
  const roleMappings = (Object.entries(roles) as [AccountRoleKey, string][])
    .filter(([role, accountNumber]) => !mapped.has(role) && chartNumbers.has(accountNumber))
    .map(([role, accountNumber]) => ({ role, accountNumber }));

  return { batches, roleMappings };
}
