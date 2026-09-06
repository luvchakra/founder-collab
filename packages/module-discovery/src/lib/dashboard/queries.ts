import { cache } from "react";
import { createClient } from "../../db/server";
import type { Business, Product, Workspace } from "../tenancy/types";
import {
  getProspectCountsForWorkspaces,
  listProspectsForWorkspaces,
} from "../prospects/queries";
import { getWorkspaceUsageForWorkspaces } from "../usage/queries";

export type AccountWorkspaceEntry = { workspace: Workspace; product: Product; business: Business };

type ProductRow = Product & { workspaces: Workspace[] };
type BusinessRow = Business & { products: ProductRow[] };

/**
 * Every business/product/workspace on an account, resolved with a single embedded
 * PostgREST query (businesses -> products -> workspaces, following the foreign keys from
 * supabase/migrations/20260904182540_tenancy_schema.sql) instead of three sequential
 * round trips, and memoized per accountId for the lifetime of the request via React's
 * cache(). Row Level Security still applies per table for embedded resources -- Supabase
 * evaluates each nested table's own policies, so this reads exactly the same rows the
 * three-query version did, just in one trip. app/(dashboard)/layout.tsx (runs on every
 * dashboard page) and the /dashboard page itself both need this full account scan --
 * without memoizing by the one primitive argument they share (accountId), each would run
 * its own copy of this query back to back on every visit to /dashboard specifically.
 * cache() only dedupes by argument identity, and an array of ids built fresh in each
 * caller would never match another caller's array by reference, which is why this takes
 * accountId (a primitive, safe to key on) rather than a pre-built id list.
 */
export const getAccountWorkspaceEntries = cache(async (accountId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*, products(*, workspaces(*))")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true })
    .order("created_at", { ascending: true, referencedTable: "products" });
  if (error) throw error;

  const rows = (data ?? []) as unknown as BusinessRow[];

  const businesses: Business[] = [];
  const productsByBusiness: Record<string, Product[]> = {};
  const allProducts: Product[] = [];
  const entries: AccountWorkspaceEntry[] = [];

  for (const { products, ...business } of rows) {
    businesses.push(business);
    const businessProducts: Product[] = [];
    for (const { workspaces, ...product } of products) {
      businessProducts.push(product);
      allProducts.push(product);
      const workspace = workspaces[0];
      if (workspace) entries.push({ workspace, product, business });
    }
    productsByBusiness[business.id] = businessProducts;
  }

  return { businesses, productsByBusiness, allProducts, entries };
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
