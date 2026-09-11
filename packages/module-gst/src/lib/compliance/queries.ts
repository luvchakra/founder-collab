import { cache } from "react";
import { createClient } from "../../db/server";
import type { ComplianceProfile } from "./types";

/** Raw row, or null if this business has never saved one yet (no default-row backfill --
 * see the `gst.compliance_profiles` migration's own docstring). Most callers want
 * `getEffectiveComplianceProfile()` below instead, which applies the India/GST default a
 * missing row implies. */
export const getComplianceProfile = cache(async (businessId: string): Promise<ComplianceProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compliance_profiles")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type EffectiveComplianceProfile = {
  businessId: string;
  country: string;
  regime: string;
  registrationId: string | null;
  /** false when this is the synthesized India/GST default, not an explicit save yet --
   * lets the country selector show "(default)" rather than implying the user chose it. */
  isExplicit: boolean;
};

/** The country/regime a business's Compliance module is actually operating under right
 * now, applying the India/GST default when no row has been saved -- the shape every UI
 * consumer (the country selector, future regime selector, any page that needs "what
 * country am I in") should read instead of the raw nullable row. */
export const getEffectiveComplianceProfile = cache(
  async (businessId: string): Promise<EffectiveComplianceProfile> => {
    const row = await getComplianceProfile(businessId);
    if (row) {
      return {
        businessId: row.business_id,
        country: row.country,
        regime: row.regime,
        registrationId: row.registration_id,
        isExplicit: true,
      };
    }
    return { businessId, country: "IN", regime: "GST", registrationId: null, isExplicit: false };
  },
);
