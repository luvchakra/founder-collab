import { DEFAULT_ACCOUNT_ROLES } from "../accounting/chart-of-accounts";
import type { AccountRoleKey } from "../accounting/types";
import type { ActivationSettings, WizardStep } from "./types";

/**
 * FIN-3: pure, no-I/O -- turns already-fetched data from the eight underlying sources into
 * the eight step statuses the checklist renders. Same "pure aggregation, thin query layer"
 * split `lib/exceptions-queue/derive.ts` and `lib/backfill/derive.ts` already follow.
 */

const ROLE_KEYS = Object.keys(DEFAULT_ACCOUNT_ROLES) as AccountRoleKey[];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function deriveActivationSteps(inputs: {
  businessName: string;
  settings: ActivationSettings;
  accountCount: number;
  mappedRoleCount: number;
  hasGstin: boolean;
  bankAccountCount: number;
}): WizardStep[] {
  return [
    {
      key: "business_profile",
      label: "Business profile",
      complete: true,
      detail: inputs.businessName || "—",
    },
    {
      key: "accounting_method",
      label: "Accounting method",
      complete: true,
      detail: inputs.settings.accountingMethod === "accrual" ? "Accrual" : "Cash",
    },
    {
      key: "fiscal_year",
      label: "Fiscal year",
      complete: true,
      detail: `Starts in ${MONTH_NAMES[inputs.settings.fiscalYearStartMonth - 1]}`,
    },
    {
      key: "chart_of_accounts",
      label: "Chart of accounts",
      complete: inputs.accountCount > 0,
      detail: inputs.accountCount > 0 ? `${inputs.accountCount} account${inputs.accountCount === 1 ? "" : "s"}` : "Not set up yet",
      linkSlug: "accounts",
    },
    {
      key: "gst_profile",
      label: "GST profile",
      complete: inputs.hasGstin,
      detail: inputs.hasGstin ? "GSTIN on file" : "No GSTIN on file yet",
      linkSlug: "profile",
    },
    {
      key: "account_mappings",
      label: "Account mappings",
      complete: inputs.mappedRoleCount >= ROLE_KEYS.length,
      detail: `${inputs.mappedRoleCount} of ${ROLE_KEYS.length} roles mapped`,
      linkSlug: "accounts",
    },
    {
      key: "opening_balances",
      label: "Opening balances",
      // No screen of its own to check independently -- see `queries.ts`'s own docstring
      // for why this shares chart-of-accounts' own completion signal.
      complete: inputs.accountCount > 0,
      detail: "Set when you create each account on the Chart of Accounts screen",
      linkSlug: "accounts",
    },
    {
      key: "bank_accounts",
      label: "Bank accounts",
      complete: inputs.bankAccountCount > 0,
      detail: inputs.bankAccountCount > 0 ? `${inputs.bankAccountCount} account${inputs.bankAccountCount === 1 ? "" : "s"}` : "None added yet",
      linkSlug: "banking",
    },
  ];
}
