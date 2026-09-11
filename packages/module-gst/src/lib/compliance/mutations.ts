import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { defaultRegimeFor, isCountrySupported } from "./countries";

/**
 * COMPLY-P0-01.2 (Country Selector): switches a business's active Compliance country.
 * Regime is not independently choosable yet (COMPLY-P0-01.3's own job) -- this always
 * sets the country's default regime, which is unambiguous today since every "supported"
 * catalog entry has exactly one regime.
 *
 * Refuses a "planned" (not yet implemented) country even though the UI already disables
 * selecting one -- defense in depth, same reasoning `requireModule()`/`requirePermission()`
 * exist even though RLS is the real backstop: a disabled option in one client is not a
 * server-side guarantee.
 */
export async function setComplianceCountry(businessId: string, country: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  if (!isCountrySupported(country)) {
    throw new Error(`${country} isn't a supported Compliance country yet -- it's on the roadmap, not available to select.`);
  }
  const regime = defaultRegimeFor(country);
  if (!regime) {
    // Unreachable while every supported country has >=1 regime, but fail loudly rather
    // than silently writing an empty regime if that ever stops being true.
    throw new Error(`${country} has no default tax regime configured.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("compliance_profiles").upsert({ business_id: businessId, country, regime });
  if (error) throw error;
}
