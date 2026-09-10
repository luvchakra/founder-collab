import { createClient } from "../../db/server";
import { normalizeUrl } from "@cofounderai/core/lib/url";
import { publish } from "@cofounderai/core/events/mutations";
import { getBusinessIdForWorkspace, getProduct, getWorkspace } from "../tenancy/queries";
import { backfillCustomerContactsForWonProspect, ensureProspectParty, markProspectPartyWon } from "./party-sync";
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
  const row = toRow(input);
  const { data, error } = await supabase
    .from("prospects")
    .insert({ workspace_id: workspaceId, ...row })
    .select()
    .single();
  if (error) throw error;

  const partyId = await ensureProspectParty(workspaceId, data.party_id, {
    name: row.company_name,
    email: row.company_email,
  });
  const { data: linked, error: linkError } = await supabase
    .from("prospects")
    .update({ party_id: partyId })
    .eq("id", data.id)
    .select()
    .single();
  if (linkError) throw linkError;
  return linked;
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

  // Winning adds the 'customer' role to the same party -- it never copies a record
  // (00-MASTER-PLAN.md §5). No party yet (a pre-D-3 prospect never backfilled) is not
  // this action's job to fix; it just skips the role sync rather than failing the outcome
  // change the caller actually asked for.
  if (outcome === "won" && data.party_id) {
    await markProspectPartyWon(data.workspace_id, data.party_id);

    const businessId = await getBusinessIdForWorkspace(data.workspace_id);
    if (businessId) {
      // Cross-module UX pass, item #2: "the contact a message was sent to should be
      // created as a customer in both inventory and service" -- both read
      // core.parties/core.party_contacts directly (00-MASTER-PLAN.md §5), so this is
      // what actually makes the new customer usable there, not just present. Best-effort:
      // never let a contact-mirroring hiccup block the outcome change the caller asked for.
      try {
        await backfillCustomerContactsForWonProspect(businessId, data.party_id, data.id);
      } catch (err) {
        console.error("[prospects/mutations] backfillCustomerContactsForWonProspect failed:", err);
      }
    }

    // Item #3 of the same pass: the FSM estimate a won prospect's opportunity leads to
    // should default to a charge line for the product it was actually prospected for, if
    // that product's own core.items mirror exists (lib/tenancy/mutations.ts#createProduct
    // et al). Resolved here (once) and carried on both handoff paths -- the manual
    // "Create opportunity" button (module-fsm/contract/index.ts) and this same event's
    // automatic consumer (module-fsm/events/handlers.ts) -- rather than each re-deriving
    // it from workspaceId.
    const workspace = await getWorkspace(data.workspace_id);
    const product = workspace ? await getProduct(workspace.product_id) : null;
    const itemId = product?.linked_item_id ?? null;

    // F-13's own handoff trigger (02-FSM-PRD.md §6): publish once the party's own
    // customer role is guaranteed to exist, so any consumer reacting to this can safely
    // assume it's already there. `requiredModule: 'fsm'` parks the event (not a failure)
    // until an fsm license exists for this business -- core.replay_parked_events()
    // un-parks it on activation, same as every other required-module event in this
    // platform. The PRD's own payload sketch (`contact_ids[]`, `conversation_id`) doesn't
    // match what a Prospect actually carries today (no contact or conversation concept
    // exists here yet, confirmed against ./types.ts before writing this) -- substituted
    // with `companyName`/`description`, the closest real fields to "seed the new
    // opportunity's own scope of work from", and flagged here per CLAUDE.md's "live
    // source wins, flag the discrepancy" rule rather than silently inventing the missing
    // fields.
    if (businessId) {
      await publish({
        businessId,
        type: "prospect.won",
        requiredModule: "fsm",
        payload: {
          workspaceId: data.workspace_id,
          prospectId: data.id,
          partyId: data.party_id,
          companyName: data.company_name,
          description: data.description,
          itemId,
        },
      });
    }
  }
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
  const { data, error } = await supabase
    .from("prospects")
    .insert(inputs.map((input) => ({ workspace_id: workspaceId, ...toRow(input) })))
    .select();
  if (error) throw error;

  await linkPartiesForProspects(workspaceId, data ?? []);
  return data?.length ?? 0;
}

/** Links each newly-inserted prospect to its own core.parties row. One insert per
 * prospect (not a single batched call) -- CSV-paste/suggestion-approval volumes are
 * modest (tens to low hundreds), and Supabase JS has no batched "insert then link" RPC
 * to reach for here without adding a stored procedure this story doesn't otherwise need. */
async function linkPartiesForProspects(
  workspaceId: string,
  prospects: Pick<Prospect, "id" | "party_id" | "company_name" | "company_email">[],
): Promise<void> {
  if (prospects.length === 0) return;
  const supabase = await createClient();
  for (const prospect of prospects) {
    const partyId = await ensureProspectParty(workspaceId, prospect.party_id, {
      name: prospect.company_name,
      email: prospect.company_email,
    });
    const { error } = await supabase
      .from("prospects")
      .update({ party_id: partyId })
      .eq("id", prospect.id);
    if (error) throw error;
  }
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

  await linkPartiesForProspects(workspaceId, inserted ?? []);

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
