import { createClient } from "../../db/server";
import { listDiscoveryDefinitions } from "./queries";
import type { IcpProfile } from "../icp/types";
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

/** DISC-OFFER-P0-10.1's own "Build Discovery Strategy" pipeline stage -- deterministic,
 * no AI call (CLAUDE.md dev principle #4/#5): the approved ICP's own industries/
 * geographies/roles/buying_signals/exclusions already say who and what to watch for, so
 * turning them into a starting monitoring strategy is field mapping, not a judgment call
 * an LLM would need to make. Only ever creates -- never touches an existing definition,
 * whether founder-authored or from a prior run (§25's own "must NOT silently overwrite
 * user-approved values", and DISC-OFFER-P0-04.2's own play presets already establish that
 * a definition is something a founder curates, not a singleton the system owns). Returns
 * `null` when the workspace already has at least one definition -- nothing to seed,
 * a normal and honest outcome on every rerun after the first. Left `is_enabled: true` and
 * `monitoring_frequency: "manual"` (the same default `createDiscoveryDefinition`'s own
 * dialog form defaults to) -- this pipeline only runs on an explicit click today
 * (DISC-OFFER-P1-01.1 "Scheduled Offering Re-Discovery" is the story that would ever
 * change that default). */
export async function seedDiscoveryDefinitionFromIcp(
  workspaceId: string,
  icp: Pick<IcpProfile, "industries" | "geographies" | "roles" | "buying_signals" | "exclusions">,
): Promise<DiscoveryDefinition | null> {
  const existing = await listDiscoveryDefinitions(workspaceId);
  if (existing.length > 0) return null;

  return createDiscoveryDefinition(workspaceId, {
    name: "AI Discovery",
    targetGeographies: icp.geographies,
    targetIndustries: icp.industries,
    buyerRoles: icp.roles,
    desiredSignals: icp.buying_signals,
    excludedSignals: [],
    disqualifiers: icp.exclusions,
    minimumScore: null,
    monitoringFrequency: "manual",
  });
}

/** Parses one list-field textarea (one item per line) into a clean string array -- same
 * convention as icp/mutations.ts's own parseListField. */
export function parseListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
