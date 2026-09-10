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

export type AccountWorkspaceEntry = { workspace: Workspace; product: Product; business: Business };

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
export const getAccountWorkspaceEntries = cache(async (accountId: string) => {
  const core = await createCoreClient({ schema: "core" });
  // Item #17 of a UX pass: a disabled business (core.businesses.disabled_at) drops out
  // of the navbar/business switcher and this account-wide dashboard entirely -- nothing
  // underneath it is touched, so re-enabling (Admin > Business) brings it straight back.
  const { data: businesses, error: businessesError } = await core
    .from("businesses")
    .select("*")
    .eq("account_id", accountId)
    .is("disabled_at", null)
    .order("created_at", { ascending: true });
  if (businessesError) throw businessesError;

  const productsByBusiness: Record<string, Product[]> = {};
  const allProducts: Product[] = [];
  const entries: AccountWorkspaceEntry[] = [];
  const businessById = new Map<string, Business>((businesses ?? []).map((b) => [b.id, b]));
  for (const business of businesses ?? []) {
    productsByBusiness[business.id] = [];
  }

  const businessIds = [...businessById.keys()];
  if (businessIds.length > 0) {
    const supabase = await createClient();
    const { data: productRows, error } = await supabase
      .from("products")
      .select("*")
      .in("business_id", businessIds)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const products = (productRows ?? []) as Product[];

    // A separate listWorkspacesForProducts() call, not a nested `.select("*,
    // workspaces(*))")` embed -- the embed was silently resolving to zero workspaces
    // per product for every account (Conversions on the Executive Dashboard always
    // showed the "create your first business" empty state, even for accounts with
    // real products/workspaces), while this same batched lookup already works
    // correctly for getBusinessUsage() (lib/usage/queries.ts) and buildChatContext()
    // (lib/ai/chat.ts).
    const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
    const workspaceByProductId = new Map(workspaces.map((w) => [w.product_id, w] as const));

    for (const product of products) {
      const business = businessById.get(product.business_id);
      if (!business) continue;
      productsByBusiness[business.id]!.push(product);
      allProducts.push(product);
      const workspace = workspaceByProductId.get(product.id);
      if (workspace) entries.push({ workspace, product, business });
    }
  }

  return { businesses: businesses ?? [], productsByBusiness, allProducts, entries };
});

/**
 * Usage + prospect status counts + the full pipeline-derived prospect list for every
 * workspace on an account, in three more batched queries -- memoized per accountId
 * alongside getAccountWorkspaceEntries above. Fetching the full prospect list once here
 * (rather than once per caller) means the dashboard's business/product slice-and-dice
 * filter and the header's alert derivation can both just filter this same in-memory list
 * by workspace id instead of issuing their own queries.
 */
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
