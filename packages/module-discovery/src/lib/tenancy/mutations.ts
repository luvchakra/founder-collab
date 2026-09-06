import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { seedDefaultLicenses } from "@cofounderai/core/licensing/lifecycle";
import type { Business, Product } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1). */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * Tenancy write layer. As with queries.ts, these run through the RLS-scoped server
 * client -- the INSERT ... WITH CHECK policies on businesses/products are what actually
 * stop a user from writing into an account/business they don't belong to (Postgres
 * rejects the insert with a policy-violation error, which callers should surface as-is
 * rather than swallow).
 */

export async function createBusiness(
  accountId: string,
  input: { name: string; description?: string; website?: string; industry?: string },
): Promise<Business> {
  const name = input.name.trim();
  if (!name) throw new Error("Business name is required.");

  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .insert({
      account_id: accountId,
      name,
      description: input.description?.trim() || null,
      website: input.website?.trim() || null,
      industry: input.industry?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  await seedDefaultLicenses(data.id);
  return data;
}

/** Only the fields actually passed are updated -- callers each submit one field at a
 * time (the inline rename/edit controls each own a single input), never the whole row. */
export async function updateBusiness(
  businessId: string,
  input: { name?: string; description?: string },
): Promise<Business> {
  const patch: Record<string, string | null> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Business name is required.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description.trim() || null;
  }

  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createProduct(
  businessId: string,
  input: { name: string; description?: string; website?: string },
): Promise<Product> {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      name,
      description: input.description?.trim() || null,
      website: input.website?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Only the fields actually passed are updated -- see updateBusiness's docstring. */
export async function updateProduct(
  productId: string,
  input: { name?: string; description?: string; website?: string },
): Promise<Product> {
  const patch: Record<string, string | null> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Product name is required.");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = input.description.trim() || null;
  }
  if (input.website !== undefined) {
    patch.website = input.website.trim() || null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
