import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Business, Product, Workspace } from "../tenancy/types";
import { listWorkspacesForProducts } from "../tenancy/queries";
import {
  getProspectCountsForWorkspaces,
  listProspectsForWorkspaces,
} from "../prospects/queries";
import { getWorkspaceUsageForWorkspaces } from "../usage/queries";

export type AccountWorkspaceEntry = { workspace: Workspace; product: Product; business: Business & { slug: string } };

/**
 * Every business/product/workspace on an account. Two queries, not one embedded
 * PostgREST call: businesses live in `core` (Epic 2's C-1) while products/workspaces
 * stay in `discovery`, and PostgREST can't embed a nested select across two schemas
 * exposed through two differently-scoped clients. Memoized per accountId for the
 * lifetime of the request via React's cache(). Row Level Security still applies per
 * table -- Supabase evaluates each query's own policies.
 * app/(dashboard)/layout.tsx (runs on every dashboard page) and the /dashboard page
 * itself both need this full account scan -- without memoizing by the one primitive
 * argument they share (accountId), each would run its own copy of this query back to
 * back on every visit to /dashboard specifically. cache() only dedupes by argument
 * identity, and an array of ids built fresh in each caller would never match another
 * caller's array by reference, which is why this takes accountId (a primitive, safe to
 * key on) rather than a pre-built id list.
 */
/**
 * The account's businesses with their slugs and discovery products -- everything the
 * dashboard shell needs to draw the rail and the business switcher. Two round trips:
 * the businesses, then their settings (slugs) and products together, since both key
 * off the business ids alone. Split out of `getAccountWorkspaceEntries` so the shell
 * can paint without the workspace lookup that only the alerts and the AI-credits meter
 * need; both are cache()-wrapped by accountId, so a page that asks for the fuller
 * shape in the same request reuses this result rather than re-scanning.
 */
export const getAccountBusinesses = cache(async (accountId: string) => {
  const core = await createCoreClient({ schema: "core" });
  const { data: rawBusinesses, error: businessesError } = await core
    .from("businesses")
    .select("*")
    // RBAC-11: every business the user belongs to -- their own account's and any they were
    // invited into. RLS (core.user_business_ids()) is what scopes this, not the account id;
    // accountId stays the cache key.
    .is("disabled_at", null)
    .order("created_at", { ascending: true });
  if (businessesError) throw businessesError;

  const businessIds = (rawBusinesses ?? []).map((b) => b.id);
  const productsByBusiness: Record<string, Product[]> = {};
  for (const business of rawBusinesses ?? []) {
    productsByBusiness[business.id] = [];
  }
  if (businessIds.length === 0) {
    return { businesses: [] as (Business & { slug: string })[], productsByBusiness, allProducts: [] as Product[] };
  }

  const supabase = await createClient();
  const [{ data: settingsRows, error: settingsError }, { data: productRows, error: productsError }] =
    await Promise.all([
      core.from("business_settings").select("business_id, slug").in("business_id", businessIds),
      supabase.from("products").select("*").in("business_id", businessIds).order("created_at", { ascending: true }),
    ]);
  if (settingsError) throw settingsError;
  if (productsError) throw productsError;

  const slugByBusinessId = new Map((settingsRows ?? []).map((s) => [s.business_id, s.slug]));
  const businesses = (rawBusinesses ?? []).map((b) => ({ ...b, slug: slugByBusinessId.get(b.id) ?? b.id }));
  const allProducts: Product[] = [];
  for (const product of (productRows ?? []) as Product[]) {
    const bucket = productsByBusiness[product.business_id];
    if (!bucket) continue;
    bucket.push(product);
    allProducts.push(product);
  }

  return { businesses, productsByBusiness, allProducts };
});

export const getAccountWorkspaceEntries = cache(async (accountId: string) => {
  const { businesses, productsByBusiness, allProducts } = await getAccountBusinesses(accountId);
  const businessById = new Map<string, Business & { slug: string }>(businesses.map((b) => [b.id, b]));

  const workspaces = await listWorkspacesForProducts(allProducts.map((p) => p.id));
  const workspaceByProductId = new Map(workspaces.map((w) => [w.product_id, w] as const));

  const entries: AccountWorkspaceEntry[] = [];
  for (const product of allProducts) {
    const business = businessById.get(product.business_id);
    if (!business) continue;
    const workspace = workspaceByProductId.get(product.id);
    if (workspace) entries.push({ workspace, product, business });
  }

  return { businesses, productsByBusiness, allProducts, entries };
});

export const getAccountUsageAndProspects = cache(async (accountId: string) => {
  const { entries } = await getAccountWorkspaceEntries(accountId);
  const workspaceIds = entries.map((e) => e.workspace.id);

  const [usageByWorkspace, countsByWorkspace, prospects] = await Promise.all([
    getWorkspaceUsageForWorkspaces(workspaceIds),
    getProspectCountsForWorkspaces(workspaceIds),
    listProspectsForWorkspaces(workspaceIds),
  ]);

  return { usageByWorkspace, countsByWorkspace, prospects };
});
