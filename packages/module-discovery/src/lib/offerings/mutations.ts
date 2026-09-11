import { createClient } from "../../db/server";
import { createProduct } from "../tenancy/mutations";
import { getOffering } from "./queries";
import type { Offering, OfferingStatus, OfferingType } from "./types";

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

/**
 * DISC-OFFER-P0-01.3's "Create" action, full field set -- creates the base row through
 * the existing `createProduct()` (so the inventory-item mirror side effect it already
 * has keeps happening unchanged) then applies the new Offering fields as a second,
 * additive write via `updateOfferingProfile()` above, rather than duplicating
 * `createProduct()`'s own insert + mirror logic here.
 */
export async function createOffering(
  businessId: string,
  input: {
    name: string;
    website?: string | null;
    description?: string | null;
    category?: string | null;
    offeringType?: OfferingType | null;
    valueProposition?: string | null;
    primaryProblem?: string | null;
    targetMarket?: string | null;
    detailedDescription?: string | null;
  },
): Promise<Offering> {
  const created = await createProduct(businessId, {
    name: input.name,
    website: input.website ?? undefined,
    description: input.description ?? undefined,
  });
  return updateOfferingProfile(created.id, {
    category: input.category,
    offeringType: input.offeringType,
    valueProposition: input.valueProposition,
    primaryProblem: input.primaryProblem,
    targetMarket: input.targetMarket,
    detailedDescription: input.detailedDescription,
  });
}

/**
 * DISC-OFFER-P0-01.3's real three-way lifecycle ("Offerings support active/inactive/
 * archive") -- a single explicit setter rather than three separate
 * activate/deactivate/archive functions, since all three are the same one-column write;
 * `disableProduct()`/`enableProduct()` (`lib/tenancy/mutations.ts`) stay exactly as they
 * are for whatever still calls them, this doesn't replace them.
 */
export async function setOfferingStatus(offeringId: string, status: OfferingStatus): Promise<Offering> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update({ status }).eq("id", offeringId).select().single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-01.3's "Duplicate/clone" -- a real new offering (its own new
 * `discovery.workspaces` row, auto-created by the same DB trigger every product gets),
 * copying every field including the new Offering ones, not just name/description/
 * website. Deliberately does NOT copy `product_profile`/`product_profile_generated_at`
 * (the AI-researched deep profile) -- that was generated for the original's own
 * website/description at a point in time, and cloning it onto a fresh row would present
 * stale AI research as if it were already current for the copy.
 */
export async function duplicateOffering(businessId: string, offeringId: string): Promise<Offering> {
  const original = await getOffering(offeringId);
  if (!original) throw new Error("Offering not found.");

  return createOffering(businessId, {
    name: `${original.name} (copy)`,
    website: original.website,
    description: original.description,
    category: original.category,
    offeringType: original.offering_type,
    valueProposition: original.value_proposition,
    primaryProblem: original.primary_problem,
    targetMarket: original.target_market,
    detailedDescription: original.detailed_description,
  });
}
