import { cache } from "react";
import { createClient } from "../../db/server";
import type { TaxRegistration } from "./types";

/** Every registration for a business, newest first -- the future COMPLY-P0-04.1 GSTIN
 * Management page's own read model, but generic (works for any country/regime, not just
 * India), and usable by anything else that needs "what registrations does this business
 * hold" (e.g. a future tax-determination engine picking the right GSTIN for a document's
 * place of supply). */
export const listTaxRegistrations = cache(async (businessId: string): Promise<TaxRegistration[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_registrations")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});

export const listTaxRegistrationsForRegime = cache(
  async (businessId: string, country: string, regime: string): Promise<TaxRegistration[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tax_registrations")
      .select("*")
      .eq("business_id", businessId)
      .eq("country", country)
      .eq("regime", regime)
      .order("is_primary", { ascending: false });
    if (error) throw error;
    return data;
  },
);

/** The primary (default) registration for a business's current country/regime, or null
 * if none is marked primary (or none exists at all) -- the row a tax-determination engine
 * should fall back to when a document doesn't pin a specific registration. */
export const getPrimaryTaxRegistration = cache(
  async (businessId: string, country: string, regime: string): Promise<TaxRegistration | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tax_registrations")
      .select("*")
      .eq("business_id", businessId)
      .eq("country", country)
      .eq("regime", regime)
      .eq("is_primary", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
);
