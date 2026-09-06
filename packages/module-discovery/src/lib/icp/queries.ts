import { cache } from "react";
import { createClient } from "../../db/server";
import type { IcpProfile } from "./types";

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
