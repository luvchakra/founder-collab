import { cache } from "react";
import { createClient } from "../../db/server";
import type { DiscoveryDefinition } from "./types";

/** cache()-wrapped for the same request-deduplication reason every other list query in
 * this module is. Ordered by creation so a founder's definitions stay in the order they
 * added them (no ranking concept yet to sort by instead). */
export const listDiscoveryDefinitions = cache(async (workspaceId: string): Promise<DiscoveryDefinition[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discovery_definitions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
});
