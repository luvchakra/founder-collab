import type { BackfillRunResult } from "../backfill/types";

/**
 * FIN-3 (Activation Wizard, §42) -- tracks and sequences the ten first-run steps. Five of
 * them (chart of accounts, GST profile, account mappings, opening balances, bank
 * accounts) are read from screens/tables that already exist elsewhere in this module;
 * this file only adds the shape for the three genuinely new pieces §42 asked for
 * (accounting method, fiscal year as a real per-business setting, and activation itself)
 * plus the summary that composes all eight into one checklist.
 */

export type AccountingMethod = "accrual" | "cash";

export type ActivationSettings = {
  accountingMethod: AccountingMethod;
  /** 1-12. Reads `core.business_settings.fiscal_year_start_month`, which existed before
   * this story but nothing wrote or read it -- every page that needed a fiscal year just
   * hardcoded April. */
  fiscalYearStartMonth: number;
};

export type FinanceActivation = {
  activatedAt: string | null;
  activatedBy: string | null;
};

export type WizardStepKey =
  | "business_profile"
  | "accounting_method"
  | "fiscal_year"
  | "chart_of_accounts"
  | "gst_profile"
  | "account_mappings"
  | "opening_balances"
  | "bank_accounts";

export type WizardStep = {
  key: WizardStepKey;
  label: string;
  complete: boolean;
  /** One line: what's true right now, or what's missing. */
  detail: string;
  /** Nav slug of the existing screen this step is about, if any -- undefined for the two
   * steps (accounting method, fiscal year) this wizard edits inline rather than sending
   * the founder elsewhere. */
  linkSlug?: string;
};

export type ActivationSummary = {
  businessName: string;
  settings: ActivationSettings;
  steps: WizardStep[];
  activation: FinanceActivation;
};

/** The shape `apps/web`'s activate server action returns, and `ActivateButton`'s own
 * `useActionState` state -- defined here rather than in the app route for the same
 * layering reason `BackfillRunState` is defined in `lib/backfill/types.ts`: a component
 * inside this package must never import back from the app that hosts it. */
export type ActivateFinanceState =
  | { status: "idle" }
  | { status: "done"; activatedAt: string; firstActivation: boolean; backfill: BackfillRunResult }
  | { status: "error"; message: string };
