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

  // The creator becomes the business's own owner (core.business_members) -- separate
  // from account-level membership, this is what C-7's has_permission() resolves against.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { error: memberError } = await supabase
      .from("business_members")
      .insert({ business_id: data.id, user_id: user.id, role: "owner" });
    if (memberError) throw memberError;
  }

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

/**
 * Bulk-creates products from a catalog import (business page), skipping anything that's
 * already a product on this business (by name, case-insensitive) rather than creating a
 * duplicate -- same "dedup against the existing set, not just within the batch" shape
 * prospects-import already uses. Returns how many were actually inserted vs. skipped as
 * duplicates so the caller can report both.
 */
export async function createProductsBulk(
  businessId: string,
  rows: { name: string; description?: string; website?: string }[],
): Promise<{ inserted: number; duplicates: number }> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("name")
    .eq("business_id", businessId);
  if (existingError) throw existingError;
  const existingNames = new Set((existing ?? []).map((p) => p.name.trim().toLowerCase()));

  const seenInBatch = new Set<string>();
  const toInsert: { business_id: string; name: string; description: string | null; website: string | null }[] = [];
  let duplicates = 0;

  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existingNames.has(key) || seenInBatch.has(key)) {
      duplicates += 1;
      continue;
    }
    seenInBatch.add(key);
    toInsert.push({
      business_id: businessId,
      name,
      description: row.description?.trim() || null,
      website: row.website?.trim() || null,
    });
  }

  if (toInsert.length === 0) return { inserted: 0, duplicates };
  const { data, error } = await supabase.from("products").insert(toInsert).select();
  if (error) throw error;
  return { inserted: data?.length ?? 0, duplicates };
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
