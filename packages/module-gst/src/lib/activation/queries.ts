import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { listAccounts, listAccountRoles } from "../accounting/queries";
import { listBankAccounts } from "../accounting/banking-queries";
import { getGstProfile } from "../profile/queries";
import { getBusiness } from "../tenancy/queries";
import type { AccountRoleKey } from "../accounting/types";
import { deriveActivationSteps } from "./derive";
import type { AccountingMethod, ActivationSettings, ActivationSummary, FinanceActivation } from "./types";

/** India's fiscal year (this module's home jurisdiction) until this story: every page
 * needing one hardcoded this same literal. Kept here as the one fallback for a business
 * that has never saved a `core.business_settings` row at all -- the column itself already
 * defaults to it once a row exists. */
const DEFAULT_FISCAL_YEAR_START_MONTH = 4;

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** The two settings this story actually adds a write path for. Falls back to the schema
 * defaults when the business has no `business_settings` row yet at all (a brand-new
 * business, before its first save anywhere on that table). */
export const getActivationSettings = cache(async (businessId: string): Promise<ActivationSettings> => {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("business_settings").select("accounting_method, fiscal_year_start_month").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return {
    accountingMethod: (data?.accounting_method as AccountingMethod | undefined) ?? "accrual",
    fiscalYearStartMonth: data?.fiscal_year_start_month ?? DEFAULT_FISCAL_YEAR_START_MONTH,
  };
});

export const getFinanceActivation = cache(async (businessId: string): Promise<FinanceActivation> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("finance_activation").select("activated_at, activated_by").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return { activatedAt: data?.activated_at ?? null, activatedBy: data?.activated_by ?? null };
});

/**
 * The whole checklist in one call -- every query it composes was already cheap and
 * `cache()`-wrapped before this story; this just reads all of them together and turns
 * the results into the eight step statuses the wizard page renders.
 *
 * "Complete" is read from data that already exists wherever a screen already exists for
 * the step (chart of accounts, GST profile, account mappings, bank accounts); opening
 * balances has no screen of its own to check independently (see `lib/activation`'s own
 * top-level docstring in `types.ts` and `docs/FINANCE-PROGRESS.md`), so it shares chart
 * of accounts' own completion signal rather than inventing a second one nothing backs.
 */
export async function getActivationSummary(businessId: string): Promise<ActivationSummary> {
  const [business, accounts, rolesByAccount, bankAccounts, gstProfile, settings, activation] = await Promise.all([
    getBusiness(businessId),
    listAccounts(businessId),
    listAccountRoles(businessId),
    listBankAccounts(businessId),
    getGstProfile(businessId),
    getActivationSettings(businessId),
    getFinanceActivation(businessId),
  ]);

  const mappedRoles = new Set<AccountRoleKey>();
  for (const roles of rolesByAccount.values()) {
    for (const role of roles) mappedRoles.add(role);
  }

  const steps = deriveActivationSteps({
    businessName: business?.name ?? "",
    settings,
    accountCount: accounts.length,
    mappedRoleCount: mappedRoles.size,
    hasGstin: Boolean(gstProfile?.gstin),
    bankAccountCount: bankAccounts.length,
  });

  return { businessName: business?.name ?? "", settings, steps, activation };
}
