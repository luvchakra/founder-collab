import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { defaultRegimeFor, isCountrySupported, isRegimeSupported } from "./countries";
import { getComplianceProfile } from "./queries";

/**
 * COMPLY-P0-01.2 (Country Selector): switches a business's active Compliance country.
 * Always sets the country's default regime -- unambiguous today since every "supported"
 * catalog entry has exactly one regime, and correct even for a country with several,
 * since switching country is exactly the moment a stale regime choice from the previous
 * country would otherwise become invalid.
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

/**
 * COMPLY-P0-01.3 (Tax Regime Selector): switches the regime *within* the business's
 * current country -- e.g. a future US business choosing between two US regimes, not a
 * country change (that's `setComplianceCountry` above, which always resets the regime to
 * the new country's default). No P0 catalog entry actually has more than one regime yet
 * (India has exactly one, GST), so this is unreachable from today's UI -- the country bar
 * only renders a regime selector when `country.regimes.length > 1` -- but the mutation
 * and its validation exist now so a P1 country pack with several regimes needs no new
 * server-side plumbing, only a catalog entry with more than one `regimes` item.
 *
 * Reads the business's current country from its own saved profile (falling back to the
 * India/GST default) rather than trusting a `country` argument from the caller -- the
 * regime must belong to the country the business is *actually* in, not whatever a stale
 * client happened to pass.
 */
export async function setComplianceRegime(businessId: string, regime: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const existing = await getComplianceProfile(businessId);
  const country = existing?.country ?? "IN";

  if (!isRegimeSupported(country, regime)) {
    throw new Error(`${regime} isn't a valid tax regime for ${country}.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("compliance_profiles").upsert({ business_id: businessId, country, regime });
  if (error) throw error;
}
