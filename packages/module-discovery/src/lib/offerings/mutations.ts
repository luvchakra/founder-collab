import { createClient } from "../../db/server";
import type { Offering, OfferingType } from "./types";

/**
 * DISC-OFFER-P0-01.1's own new fields -- deliberately a separate function from
 * `updateProduct()` (`lib/tenancy/mutations.ts`) rather than widening that one's input
 * type: `updateProduct` is the existing name/description/website edit every current
 * caller (business page, product overview shell) already uses unchanged, and bolting
 * six more optional fields onto it would make every one of those call sites need to
 * reason about a form of input they don't collect. Both functions write the same
 * `discovery.products` row -- there is no second table, no second RLS policy, and no
 * write path that bypasses tenant/license enforcement (the RLS-scoped client used here
 * is identical to every other mutation in this module).
 */
export async function updateOfferingProfile(
  offeringId: string,
  input: {
    category?: string | null;
    offeringType?: OfferingType | null;
    valueProposition?: string | null;
    primaryProblem?: string | null;
    targetMarket?: string | null;
    detailedDescription?: string | null;
  },
): Promise<Offering> {
  const patch: Record<string, string | null> = {};
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.offeringType !== undefined) patch.offering_type = input.offeringType;
  if (input.valueProposition !== undefined) patch.value_proposition = input.valueProposition?.trim() || null;
  if (input.primaryProblem !== undefined) patch.primary_problem = input.primaryProblem?.trim() || null;
  if (input.targetMarket !== undefined) patch.target_market = input.targetMarket?.trim() || null;
  if (input.detailedDescription !== undefined) patch.detailed_description = input.detailedDescription?.trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(patch).eq("id", offeringId).select().single();
  if (error) throw error;
  return data;
}
