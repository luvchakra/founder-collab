import { createClient } from "../../db/server";
import type { IcpProfile } from "./types";

type IcpFieldsInput = {
  name: string;
  description: string;
  industries: string[];
  companySizes: string[];
  geographies: string[];
  roles: string[];
  painPoints: string[];
  buyingSignals: string[];
  exclusions: string[];
  revenue: string[];
  businessModel: string[];
  technology: string[];
  growthStage: string[];
  existingTools: string[];
};

function icpFieldsToRow(input: IcpFieldsInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");
  return {
    name,
    description: input.description.trim() || null,
    industries: input.industries,
    company_sizes: input.companySizes,
    geographies: input.geographies,
    roles: input.roles,
    pain_points: input.painPoints,
    buying_signals: input.buyingSignals,
    exclusions: input.exclusions,
    revenue: input.revenue,
    business_model: input.businessModel,
    technology: input.technology,
    growth_stage: input.growthStage,
    existing_tools: input.existingTools,
  };
}

/**
 * Any manual edit resets status to draft -- it must be explicitly re-approved.
 *
 * DISC-OFFER-P0-13.1: also clears `confidence`/`evidence` -- both describe how well the
 * *pre-edit* claims were grounded in the product profile; once a founder hand-edits any
 * field, that assessment no longer honestly describes what's now on the row. Same "don't
 * let a stale AI judgment linger over content a human has since changed" call as the
 * `status` reset just above, not a new precedent.
 */
export async function updateIcpProfile(icpId: string, input: IcpFieldsInput): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ ...icpFieldsToRow(input), status: "draft", confidence: null, evidence: [] })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-02.2's "ICP can be cloned" -- copies every field from one offering's ICP
 * onto another's, since `icp_profiles.workspace_id` is unique (one ICP per workspace,
 * and therefore per offering): "clone" means overwrite-or-create the target's own row
 * with the source's values, not a second row. Reset to `draft` either way -- a cloned
 * ICP still needs the founder's own review/approval for its new offering, the same as
 * any other edit.
 */
export async function cloneIcpProfileToWorkspace(sourceIcpId: string, targetWorkspaceId: string): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase.from("icp_profiles").select("*").eq("id", sourceIcpId).single();
  if (sourceError) throw sourceError;

  const row = {
    workspace_id: targetWorkspaceId,
    name: source.name,
    description: source.description,
    industries: source.industries,
    company_sizes: source.company_sizes,
    geographies: source.geographies,
    roles: source.roles,
    pain_points: source.pain_points,
    buying_signals: source.buying_signals,
    exclusions: source.exclusions,
    revenue: source.revenue,
    business_model: source.business_model,
    technology: source.technology,
    growth_stage: source.growth_stage,
    existing_tools: source.existing_tools,
    /** DISC-OFFER-P0-13.1: deliberately NOT `source.confidence`/`source.evidence` --
     * those describe how well the *source* ICP is grounded in the *source* offering's
     * own product profile; carrying them onto a different workspace/offering would
     * misrepresent evidence quoted from one product's profile as support for another's
     * ICP. Left null/empty, same as any other never-yet-(re)generated ICP, until this
     * offering's own `generateIcp` call computes real values for it. */
    confidence: null,
    evidence: [],
    status: "draft" as const,
  };

  const { data, error } = await supabase.from("icp_profiles").upsert(row, { onConflict: "workspace_id" }).select().single();
  if (error) throw error;
  return data;
}

export async function approveIcpProfile(icpId: string): Promise<IcpProfile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("icp_profiles")
    .update({ status: "approved" })
    .eq("id", icpId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Parses one list-field textarea (one item per line) into a clean string array. */
export function parseListField(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
