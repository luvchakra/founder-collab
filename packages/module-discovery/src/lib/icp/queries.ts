import { cache } from "react";
import { createClient } from "../../db/server";
import type { IcpProfile, IcpProfileVersion } from "./types";

/** cache()-wrapped: the product layout (ProductNav completion checkmark) and the ICP
 * tab's own page both call this with the same workspaceId in the same request --
 * without memoizing, that's two Supabase round trips for one navigation. */
export const getIcpProfile = cache(async (workspaceId: string): Promise<IcpProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** DISC-OFFER-P0-14.2: "ICP v1/v2/v3" -- every past content snapshot for one ICP, most
 * recent first (so "current version is clearly identified" as the first entry, matching
 * `icp_profiles.version` on the live row). Not `cache()`-wrapped, matching the sibling
 * `listPipelineStageRuns`/`listPipelineRuns` history queries in `lib/pipeline/queries.ts`
 * -- a plain read with no same-request re-read risk to guard against. */
export async function listIcpProfileVersions(icpId: string): Promise<IcpProfileVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profile_versions")
    .select("*")
    .eq("icp_id", icpId)
    .order("version", { ascending: false });
  if (error) throw error;
  return data;
}

export type CloneableIcpSource = { icpId: string; icpName: string; productId: string; productName: string };

/**
 * DISC-OFFER-P0-02.2's "ICP can be cloned" -- every *other* offering in this business
 * that already has an ICP to clone from. Two queries (products -> their workspaces'
 * ICPs) rather than a single joined one: `icp_profiles`/`workspaces`/`products` have no
 * PostgREST embed configured between them, the same "no embed, join in JS" convention
 * every other cross-table read in this module already follows.
 */
export async function listCloneableIcpSourcesForBusiness(businessId: string, excludeProductId: string): Promise<CloneableIcpSource[]> {
  const supabase = await createClient();
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .neq("id", excludeProductId);
  if (productsError) throw productsError;
  if (products.length === 0) return [];

  const { data: workspaces, error: workspacesError } = await supabase
    .from("workspaces")
    .select("id, product_id")
    .in("product_id", products.map((p) => p.id));
  if (workspacesError) throw workspacesError;
  if (workspaces.length === 0) return [];

  const { data: icps, error: icpsError } = await supabase
    .from("icp_profiles")
    .select("id, name, workspace_id")
    .in("workspace_id", workspaces.map((w) => w.id));
  if (icpsError) throw icpsError;

  const productNameById = new Map(products.map((p) => [p.id, p.name]));
  const productIdByWorkspaceId = new Map(workspaces.map((w) => [w.id, w.product_id]));

  return icps
    .map((icp) => {
      const productId = productIdByWorkspaceId.get(icp.workspace_id);
      if (!productId) return null;
      return { icpId: icp.id, icpName: icp.name, productId, productName: productNameById.get(productId) ?? "Unknown offering" };
    })
    .filter((row): row is CloneableIcpSource => row !== null);
}
