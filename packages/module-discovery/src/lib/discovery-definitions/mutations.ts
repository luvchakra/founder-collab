import { createClient } from "../../db/server";
import type { DiscoveryDefinition, MonitoringFrequency } from "./types";

type DefinitionFieldsInput = {
  name: string;
  targetGeographies: string[];
  targetIndustries: string[];
  buyerRoles: string[];
  desiredSignals: string[];
  excludedSignals: string[];
  disqualifiers: string[];
  minimumScore: number | null;
  monitoringFrequency: MonitoringFrequency;
};

function definitionFieldsToRow(input: DefinitionFieldsInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  return {
    name,
    target_geographies: input.targetGeographies,
    target_industries: input.targetIndustries,
    buyer_roles: input.buyerRoles,
    desired_signals: input.desiredSignals,
    excluded_signals: input.excludedSignals,
    disqualifiers: input.disqualifiers,
    minimum_score: input.minimumScore,
    monitoring_frequency: input.monitoringFrequency,
  };
}

/** Snapshots the workspace's *current* ICP id at creation time (per the backlog's own
 * "a Discovery Definition must reference... ICP") -- a soft reference the definition
 * keeps even if that ICP is later replaced/deleted (the FK is `on delete set null`), not
 * a live join, so a past definition's traceability doesn't silently change underfoot. */
export async function createDiscoveryDefinition(workspaceId: string, input: DefinitionFieldsInput): Promise<DiscoveryDefinition> {
  const supabase = await createClient();
  const { data: icp } = await supabase.from("icp_profiles").select("id").eq("workspace_id", workspaceId).maybeSingle();

  const { data, error } = await supabase
    .from("discovery_definitions")
    .insert({ workspace_id: workspaceId, icp_id: icp?.id ?? null, ...definitionFieldsToRow(input) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDiscoveryDefinition(definitionId: string, input: DefinitionFieldsInput): Promise<DiscoveryDefinition> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discovery_definitions")
    .update(definitionFieldsToRow(input))
    .eq("id", definitionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setDiscoveryDefinitionEnabled(definitionId: string, isEnabled: boolean): Promise<DiscoveryDefinition> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("discovery_definitions")
    .update({ is_enabled: isEnabled })
    .eq("id", definitionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDiscoveryDefinition(definitionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("discovery_definitions").delete().eq("id", definitionId);
  if (error) throw error;
}

/** Parses one list-field textarea (one item per line) into a clean string array -- same
 * convention as icp/mutations.ts's own parseListField. */
export function parseListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
