import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { seedDefaultLicenses } from "@cofounderai/core/licensing/lifecycle";
import { upsertItem } from "@cofounderai/module-inventory/contract/index";
import { computeNextDiscoveryAt, type RediscoveryInterval } from "./rediscovery";
import type { Business, Product, Workspace } from "./types";

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
  input: { name?: string; description?: string; website?: string },
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
  if (input.website !== undefined) {
    patch.website = input.website.trim() || null;
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

/**
 * Admin-menu "disable business" (item #17 of a UX pass): hides the business from the
 * navbar/business switcher (see getAccountWorkspaceEntries()'s own disabled_at filter)
 * without deleting or archiving anything it owns -- every product, prospect, job,
 * ticket, and document underneath it, plus any place another business's own records
 * happen to reference it, is untouched and comes right back on re-enable.
 */
export async function disableBusiness(businessId: string): Promise<Business> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ disabled_at: new Date().toISOString() })
    .eq("id", businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function enableBusiness(businessId: string): Promise<Business> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ disabled_at: null })
    .eq("id", businessId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Mirrors one Discovery product into a `core.items` row via module-inventory's own
 * `upsertItem` contract call (item #1 of a cross-module UX pass: "a product created in
 * Discovery should also exist in Inventory"), then stamps `linked_item_id` back onto the
 * product so both directions (this one, and inventory/lib/products/mutations.ts's own
 * mirror back into Discovery) can tell an already-mirrored row apart from a fresh one.
 * Best-effort and silent on any failure -- a business with no Inventory license gets
 * `MODULE_NOT_LICENSED` back as a normal ADR-10 result, and a product must never fail to
 * create just because its optional mirror couldn't; see this file's own callers.
 */
async function mirrorProductToInventoryItem(businessId: string, productId: string, name: string, description: string | null): Promise<void> {
  try {
    const result = await upsertItem(businessId, { name, description, kind: "good" });
    if (!result.ok) return;
    const supabase = await createClient();
    await supabase.from("products").update({ linked_item_id: result.data.id }).eq("id", productId);
  } catch {
    // Never let a mirroring failure take down the product creation it's attached to.
  }
}

export async function createProduct(
  businessId: string,
  input: { name: string; description?: string; website?: string },
): Promise<Product> {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");

  const supabase = await createClient();
  const description = input.description?.trim() || null;
  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      name,
      description,
      website: input.website?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  await mirrorProductToInventoryItem(businessId, data.id, name, description);
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

  await Promise.all((data ?? []).map((p) => mirrorProductToInventoryItem(businessId, p.id, p.name, p.description)));
  return { inserted: data?.length ?? 0, duplicates };
}

/**
 * A real delete, not an archive -- `discovery.workspaces.product_id` (and everything
 * under it: prospects, research, ICP, conversations) is `on delete cascade`, so this
 * genuinely removes all of it, not just this row. Exists mainly to clean up a
 * mistakenly AI-auto-populated or manually-created product (item #12 of a UX pass);
 * the caller is expected to confirm with the person first (an AlertDialog, matching
 * this platform's own destructive-action pattern) since there's no undo once a
 * workspace with real prospect data is gone.
 */
export async function deleteProduct(productId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) throw error;
}

/**
 * Item #4 of a UX pass ("give an option to disable, along with delete") -- an
 * archive, not a delete: nothing under the product's workspace is touched, and the
 * product simply stops being counted/highlighted as an active one. Reversible via
 * enableProduct below, same disable/enable shape disableBusiness/enableBusiness
 * already use for a business.
 */
export async function disableProduct(productId: string): Promise<Product> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", productId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function enableProduct(productId: string): Promise<Product> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ status: "active" })
    .eq("id", productId)
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

/**
 * DISC-OFFER-P1-01.1: "Scheduled Offering Re-Discovery" -- a founder picking a new
 * cadence recomputes `next_discovery_at` immediately from *now* (not from whenever the
 * offering last actually ran) -- switching to "Daily" should mean "starting today," not
 * silently reuse whatever stale schedule an earlier setting left behind. Turning
 * scheduling `off` clears `next_discovery_at` back to null -- "no false precision": a
 * workspace with scheduling off has nothing genuinely "next" to show.
 */
export async function setRediscoveryInterval(workspaceId: string, interval: RediscoveryInterval): Promise<Workspace> {
  const supabase = await createClient();
  const nextDiscoveryAt = computeNextDiscoveryAt(interval, new Date());
  const { data, error } = await supabase
    .from("workspaces")
    .update({ rediscovery_interval: interval, next_discovery_at: nextDiscoveryAt ? nextDiscoveryAt.toISOString() : null })
    .eq("id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
