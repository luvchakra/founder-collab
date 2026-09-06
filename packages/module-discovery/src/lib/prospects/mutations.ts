import { createClient } from "../../db/server";
import { normalizeUrl } from "@cofounderai/core/lib/url";
import type { Prospect, ProspectOutcome, ProspectStatus } from "./types";

export type ProspectInput = {
  companyName: string;
  website?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  description?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  companyEmail?: string;
};

export function extractDomain(url: string): string | null {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toRow(input: ProspectInput) {
  const companyName = input.companyName.trim();
  if (!companyName) throw new Error("Company name is required.");

  return {
    company_name: companyName,
    website: input.website?.trim() || null,
    domain: input.website ? extractDomain(input.website) : null,
    industry: input.industry?.trim() || null,
    company_size: input.companySize?.trim() || null,
    location: input.location?.trim() || null,
    description: input.description?.trim() || null,
    linkedin_url: input.linkedinUrl?.trim() ? normalizeUrl(input.linkedinUrl) : null,
    twitter_url: input.twitterUrl?.trim() ? normalizeUrl(input.twitterUrl) : null,
    company_email: input.companyEmail?.trim() || null,
  };
}

export async function createProspect(
  workspaceId: string,
  input: ProspectInput,
): Promise<Prospect> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .insert({ workspace_id: workspaceId, ...toRow(input) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProspect(
  prospectId: string,
  input: ProspectInput,
): Promise<Prospect> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .update(toRow(input))
    .eq("id", prospectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProspectStatus(
  prospectId: string,
  status: ProspectStatus,
): Promise<Prospect> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .update({ status })
    .eq("id", prospectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Set when a conversation with this prospect is closed (docs: Conversations redesign)
 * -- "won" is what the Conversions tab counts as a customer. */
export async function setProspectOutcome(
  prospectId: string,
  outcome: ProspectOutcome,
): Promise<Prospect> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospects")
    .update({ outcome })
    .eq("id", prospectId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Bulk-inserts prospects from a CSV paste (Epic 5 Story 4). Each row must already be
 * validated/normalized by the caller -- this just inserts.
 */
export async function createProspectsBulk(
  workspaceId: string,
  inputs: ProspectInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("prospects")
    .insert(inputs.map((input) => ({ workspace_id: workspaceId, ...toRow(input) })), {
      count: "exact",
    });
  if (error) throw error;
  return count ?? inputs.length;
}

/** Moves selected suggestions into `prospects` and removes them from the staging
 * table. Also seeds a `prospect_research` row from each suggestion's `match_reason`/
 * `source_url` (docs/prospects-pipeline-redesign-requirements.md R5) -- otherwise "why
 * we sourced this" is dropped on approval and research starts from nothing. Inserts
 * directly (rather than via `createProspectsBulk`) because it needs the new prospect
 * ids back to link the research rows. Returns how many prospects were added. */
export async function approveProspectSuggestions(
  workspaceId: string,
  suggestionIds: string[],
): Promise<number> {
  if (suggestionIds.length === 0) return 0;
  const supabase = await createClient();

  const { data: suggestions, error: fetchError } = await supabase
    .from("prospect_suggestions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("id", suggestionIds);
  if (fetchError) throw fetchError;
  if (!suggestions || suggestions.length === 0) return 0;

  const { data: inserted, error: insertError } = await supabase
    .from("prospects")
    .insert(
      suggestions.map((s) => ({
        workspace_id: workspaceId,
        ...toRow({
          companyName: s.company_name,
          website: s.website ?? undefined,
          industry: s.industry ?? undefined,
          companySize: s.company_size ?? undefined,
          location: s.location ?? undefined,
          description: s.description ?? undefined,
        }),
      })),
    )
    .select();
  if (insertError) throw insertError;

  const researchRows = suggestions
    .map((suggestion, i) => ({ suggestion, prospect: inserted?.[i] }))
    .filter(
      (
        pair,
      ): pair is { suggestion: (typeof suggestions)[number]; prospect: Prospect } =>
        Boolean(pair.prospect) && Boolean(pair.suggestion.match_reason || pair.suggestion.source_url),
    )
    .map(({ suggestion, prospect }) => ({
      workspace_id: workspaceId,
      prospect_id: prospect.id,
      recommended_angle: suggestion.match_reason,
      evidence: suggestion.source_url
        ? [
            {
              claim: suggestion.match_reason ?? "Sourced during prospect discovery.",
              source_url: suggestion.source_url,
              confidence: "inference",
            },
          ]
        : [],
    }));

  if (researchRows.length > 0) {
    const { error: researchError } = await supabase
      .from("prospect_research")
      .insert(researchRows);
    if (researchError) throw researchError;
  }

  const { error: deleteError } = await supabase
    .from("prospect_suggestions")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("id", suggestionIds);
  if (deleteError) throw deleteError;

  return inserted?.length ?? 0;
}

export async function discardProspectSuggestions(
  workspaceId: string,
  suggestionIds: string[],
): Promise<void> {
  if (suggestionIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("prospect_suggestions")
    .delete()
    .eq("workspace_id", workspaceId)
    .in("id", suggestionIds);
  if (error) throw error;
}
