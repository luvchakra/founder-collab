import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { runFinanceBackfill } from "../backfill/mutations";
import type { BackfillRunResult } from "../backfill/types";
import type { AccountingMethod } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * The two settings-only steps. Upserts, same reason `upsertGstProfile` does
 * (`lib/profile/mutations.ts`): `core.business_settings` has no row until the first save.
 * Only `requireModule` -- no `requirePermission` -- matching that same file's precedent:
 * `business_settings`'s own RLS already lets any business member write their own
 * business's settings, so a stricter application-level check here would just be a second
 * place for the two gates to disagree.
 */
export async function setAccountingMethod(businessId: string, method: AccountingMethod): Promise<void> {
  await requireModule(businessId, "gst");
  const supabase = await coreClient();
  const { error } = await supabase.from("business_settings").upsert({ business_id: businessId, accounting_method: method });
  if (error) throw error;
}

export async function setFiscalYearStartMonth(businessId: string, month: number): Promise<void> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Fiscal year start month must be between 1 and 12.");
  }
  await requireModule(businessId, "gst");
  const supabase = await coreClient();
  const { error } = await supabase.from("business_settings").upsert({ business_id: businessId, fiscal_year_start_month: month });
  if (error) throw error;
}

export type ActivateFinanceResult = {
  activatedAt: string;
  /** Null when this business had already activated before -- re-running the wizard reruns
   * the backfill scan (harmless; it's idempotent) but does not repeat the one-time
   * "activated" transition itself. */
  firstActivation: boolean;
  backfill: BackfillRunResult;
};

/**
 * Step 10, "Activate" -- and, per the backlog's own note that FIN-1/FIN-2/FIN-3 are one
 * cluster "because the wizard is what runs backfill," the thing that actually runs FIN-2.
 *
 * Never gates any existing Finance screen -- every one of them already works without this
 * having been clicked (ADR-10: no hard dependencies). This only records the one-time fact
 * that the founder walked through setup, and catches up the ledger on whatever predates
 * that moment.
 */
export async function activateFinance(businessId: string): Promise<ActivateFinanceResult> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.activation.manage");

  // Read directly rather than through `getFinanceActivation` -- that query is wrapped in
  // React's `cache()` for the many read-only pages that call it, which would otherwise
  // hand this same request the pre-write result a second time below (same reasoning
  // `lib/exceptions/queries.ts`'s own docstring gives for never caching a mutation-adjacent
  // read).
  const supabase = await createClient();
  const { data: existingRow, error: existingError } = await supabase.from("finance_activation").select("activated_at").eq("business_id", businessId).maybeSingle();
  if (existingError) throw existingError;
  const firstActivation = !existingRow?.activated_at;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const activatedAt = existingRow?.activated_at ?? new Date().toISOString();
  if (firstActivation) {
    const { error } = await supabase.from("finance_activation").upsert({
      business_id: businessId,
      activated_at: activatedAt,
      activated_by: user?.id ?? null,
    });
    if (error) throw error;
  }

  const backfill = await runFinanceBackfill(businessId);

  return { activatedAt, firstActivation, backfill };
}
