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

/** DISC-OFFER-P0-08.1: a single-record lookup by id -- needed to resolve an
 * opportunity's own `discovery_definition_id` (05.1) to a real name, e.g. for the CRM
 * handoff summary. `null` (not thrown) when the definition has since been deleted --
 * the same soft-reference tolerance `discovery_definition_id` itself already has
 * (`on delete set null`). */
export const getDiscoveryDefinition = cache(async (definitionId: string): Promise<DiscoveryDefinition | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("discovery_definitions").select("*").eq("id", definitionId).maybeSingle();
  if (error) throw error;
  return data;
});
