import { hasModule } from "@cofounderai/core/licensing/queries";
import { addPartyContact, addPartyRole } from "@cofounderai/core/parties/mutations";
import { getFirstWorkspaceForBusiness, getProduct, getWorkspace, listProducts, listWorkspacesForProducts } from "../lib/tenancy/queries";
import { createProspect } from "../lib/prospects/mutations";
import { getProspectResearch } from "../lib/research/queries";
import { listOpportunitiesForProspect } from "../lib/opportunities/queries";
import { effectiveRecommendedAction } from "../lib/opportunities/next-best-action";
import { NEXT_BEST_ACTION_LABEL } from "../lib/opportunities/types";
import { getDiscoveryDefinition } from "../lib/discovery-definitions/queries";
import { getResearchBrief } from "../lib/research-briefs/queries";
import { createClient } from "../db/server";
import type {
  ContractOpportunitySummary,
  ContractProspectSummary,
  ContractResult,
  CreateProductFromInventoryItemInput,
  CreateProspectFromExternalLeadInput,
  DiscoveryFunnelCounts,
  OfferingSummary,
} from "./types";

/**
 * module-discovery's public API surface (00-MASTER-PLAN.md §6 mechanism 2) -- the ONLY
 * thing another module may import from this package (CLAUDE.md's architecture rule #3,
 * CI-enforced by lint:boundaries). Discovery was, per
 * docs/design/crm-module-design.md's own finding, the only one of the five modules
 * with no contract surface at all -- module-inventory/module-fsm/module-gst each
 * already had one. This is that first contract, scoped to exactly what CRM's "Convert
 * to prospect" handoff (Part A, A4) needs.
 */

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "discovery");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

const CHANNEL_LABELS: Record<CreateProspectFromExternalLeadInput["contactChannel"], string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook_messenger: "Facebook Messenger",
  google_business_messages: "Google Business Messages",
};

/**
 * The CRM->Discovery handoff (docs/design/crm-module-design.md Part A, A4): turns a
 * support ticket whose sender shows buying intent into a real prospect, carrying the
 * conversation's own context forward into the prospect's description rather than
 * creating an empty shell the founder has to re-research from scratch (the same "carry
 * the why forward" principle already applied at the Discovery<->FSM handoff).
 *
 * Attributed to the business's first workspace/product (prospects are workspace-
 * scoped, but a CRM ticket is business-scoped and doesn't know which product the lead
 * is for) -- same fallback module-discovery's own chat context resolution already
 * uses. Returns NOT_FOUND (a normal result, not an error) if the business has no
 * product/workspace yet to attach the prospect to.
 */
export async function createProspectFromExternalLead(
  businessId: string,
  input: CreateProspectFromExternalLeadInput,
): Promise<ContractResult<{ prospectId: string; workspaceId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const workspace = await getFirstWorkspaceForBusiness(businessId);
  if (!workspace) return { ok: false, error: "NOT_FOUND" };

  const channelLabel = CHANNEL_LABELS[input.contactChannel];
  const description = [
    `Inbound lead via ${channelLabel} (${input.contactHandle})${input.contactName ? ` from ${input.contactName}` : ""}.`,
    `First message: "${input.firstMessage}"`,
  ].join(" ");

  try {
    let prospect = await createProspect(workspace.id, {
      companyName: input.companyName,
      description,
    });

    if (input.existingPartyId) {
      // createProspect() always auto-creates a fresh party (ensureProspectParty) since
      // it has no way to accept one -- re-point at the caller's already-resolved party
      // instead of leaving this prospect linked to a disconnected duplicate. The
      // auto-created party itself is left behind unused rather than deleted (it may
      // already have been read by something else in the same request); a minor known
      // cost, not a correctness or tenancy issue.
      const supabase = await createClient();
      const { data: relinked, error } = await supabase
        .from("prospects")
        .update({ party_id: input.existingPartyId })
        .eq("id", prospect.id)
        .select()
        .single();
      if (error) throw error;
      prospect = relinked;
      await addPartyRole(businessId, input.existingPartyId, "prospect");
    }

    // Only WhatsApp's handle is an actual phone number -- Instagram/Facebook/Google
    // Business Messages handles aren't a phone/email/LinkedIn URL, so there's no
    // structured party_contacts field to put them in; the description above (and the
    // ticket itself, via sourceTicketId) is where that context lives for those three.
    if (prospect.party_id && input.contactChannel === "whatsapp") {
      await addPartyContact({
        businessId,
        partyId: prospect.party_id,
        firstName: input.contactName ?? null,
        phone: input.contactHandle,
        isPrimary: true,
      });
    }

    return { ok: true, data: { prospectId: prospect.id, workspaceId: workspace.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A party's prospect/deal status, if it has one (docs/design/crm-module-design.md
 * Part B, B1's Customer 360 panel). RLS on discovery.prospects already scopes this to
 * workspaces the caller belongs to, so a plain party_id match is safe without a
 * separate business-membership check on top -- same reasoning every other contract
 * function here relies on RLS for, not an extra manual filter.
 */
export async function getProspectSummaryForParty(
  businessId: string,
  partyId: string,
): Promise<ContractResult<ContractProspectSummary | null>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const supabase = await createClient();
  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("id, workspace_id, status, outcome")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!prospect) return { ok: true, data: null };

  const workspace = await getWorkspace(prospect.workspace_id);
  const product = workspace ? await getProduct(workspace.product_id) : null;
  const research = await getProspectResearch(prospect.id);
  const latestOpportunity = await getLatestOpportunitySummary(prospect.id);

  return {
    ok: true,
    data: {
      prospectId: prospect.id,
      workspaceId: prospect.workspace_id,
      productId: workspace?.product_id ?? "",
      productName: product?.name ?? "Unknown product",
      status: prospect.status,
      outcome: prospect.outcome,
      buyingSignals: research?.buying_signals ?? [],
      researchId: research?.id ?? null,
      researchedAt: research?.researched_at ?? null,
      latestOpportunity,
    },
  };
}

/** DISC-OFFER-P0-08.1: the most recently created opportunity for this prospect (05.1
 * can have several across different discovery definitions/time), resolved to the
 * doc's own "Send to CRM" field list -- `null` when this prospect has no opportunity
 * at all yet. Kept as its own function rather than inlined so `getProspectSummaryForParty`
 * stays readable; not exported, since nothing outside this file needs it directly. */
async function getLatestOpportunitySummary(prospectId: string): Promise<ContractOpportunitySummary | null> {
  const opportunities = await listOpportunitiesForProspect(prospectId);
  const opportunity = opportunities[0];
  if (!opportunity) return null;

  const [definition, brief] = await Promise.all([
    opportunity.discovery_definition_id ? getDiscoveryDefinition(opportunity.discovery_definition_id) : null,
    getResearchBrief(prospectId),
  ]);

  return {
    opportunityId: opportunity.id,
    score: opportunity.score,
    confidence: opportunity.confidence,
    priority: opportunity.priority,
    status: opportunity.status,
    whyThem: opportunity.why_them,
    whyNow: opportunity.why_now,
    // DISC-OFFER-P0-15.1: reads through `effectiveRecommendedAction` -- a founder's own
    // override (set from either the Opportunity Detail page or the Overview page's "Top
    // Opportunity" gate) must be what CRM sees too, not the stale computed value the
    // override was specifically meant to replace (§25's own "must NOT silently
    // overwrite user-approved values" -- silently *ignoring* one in a live cross-module
    // read is the same failure by another name).
    recommendedAction: (() => {
      const action = effectiveRecommendedAction(opportunity);
      return action ? NEXT_BEST_ACTION_LABEL[action] : null;
    })(),
    // The AI's own reason describes its own computed guess -- once a founder has
    // overridden it, that reason no longer describes what CRM is now shown.
    recommendedActionReason: opportunity.recommended_action_override ? null : opportunity.recommended_action_reason,
    researchBriefSummary: brief?.offering_fit ?? null,
    discoveryDefinitionName: definition?.name ?? null,
  };
}

/**
 * The Inventory->Discovery half of the mirror module-discovery/lib/tenancy/mutations.ts's
 * own `mirrorProductToInventoryItem` does the other way (item #1 of a cross-module UX
 * pass) -- creates a Discovery product for a `core.items` row that didn't come from
 * Discovery in the first place, auto-creating its workspace via the same DB trigger every
 * other product creation already relies on (see tenancy/queries.ts#getWorkspaceForProduct's
 * own comment). Idempotent on `linked_item_id` -- a second call for the same item (a
 * retried mutation, or this item having already been mirrored) returns the existing
 * product instead of creating a duplicate.
 */
export async function createProductFromInventoryItem(
  businessId: string,
  input: CreateProductFromInventoryItemInput,
): Promise<ContractResult<{ productId: string }>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("products")
    .select("id")
    .eq("business_id", businessId)
    .eq("linked_item_id", input.itemId)
    .maybeSingle();
  if (existingError) return { ok: false, error: existingError.message };
  if (existing) return { ok: true, data: { productId: existing.id } };

  const { data, error } = await supabase
    .from("products")
    .insert({
      business_id: businessId,
      name: input.name,
      description: input.description ?? null,
      linked_item_id: input.itemId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { productId: data.id } };
}

/**
 * CRM-14.4's "Discovery -> CRM Funnel" -- the first four stages
 * (`discovered/contacted/engaged/qualified`), across every workspace under this
 * business's products (a business can have several products/workspaces, unlike the
 * single-workspace attribution `createProspectFromExternalLead()`/
 * `getFirstWorkspaceForBusiness()` use for a write that needs exactly one target).
 * `contacted`/`engaged` are read off `discovery.conversations` (created once outreach
 * goes out, `status` flips to `replied` once the prospect responds) rather than
 * `outreach_messages`, since a conversation is the one row per prospect this needs to
 * count distinctly, not a count of individual messages.
 */
export async function getProspectFunnelCounts(businessId: string): Promise<ContractResult<DiscoveryFunnelCounts>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const products = await listProducts(businessId);
  const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
  const workspaceIds = workspaces.map((w) => w.id);
  if (workspaceIds.length === 0) {
    return { ok: true, data: { discovered: 0, contacted: 0, engaged: 0, qualified: 0 } };
  }

  const supabase = await createClient();
  const [prospectsRes, conversationsRes] = await Promise.all([
    supabase.from("prospects").select("id, status").in("workspace_id", workspaceIds),
    supabase.from("conversations").select("prospect_id, status").in("workspace_id", workspaceIds),
  ]);
  if (prospectsRes.error) return { ok: false, error: prospectsRes.error.message };
  if (conversationsRes.error) return { ok: false, error: conversationsRes.error.message };

  const contactedProspectIds = new Set(conversationsRes.data.map((c) => c.prospect_id));
  const engagedProspectIds = new Set(conversationsRes.data.filter((c) => c.status === "replied").map((c) => c.prospect_id));

  return {
    ok: true,
    data: {
      discovered: prospectsRes.data.length,
      contacted: contactedProspectIds.size,
      engaged: engagedProspectIds.size,
      qualified: prospectsRes.data.filter((p) => p.status === "qualified").length,
    },
  };
}

/**
 * DISC-OFFER-P0-01.1's "Offering is available through a stable Discovery contract" --
 * no cross-module consumer yet, added because the story's own acceptance criteria ask
 * for it explicitly. Summary-only (id, name, type, status), matching every other
 * cross-module read here -- a caller wanting the full Offering record reads Discovery's
 * own detail page, this is only enough to know a business's offerings exist and what
 * they're called.
 */
export async function listOfferingsForBusiness(businessId: string): Promise<ContractResult<OfferingSummary[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const offerings = await listProducts(businessId);
  return {
    ok: true,
    data: offerings.map((o) => ({ offeringId: o.id, name: o.name, offeringType: o.offering_type, status: o.status })),
  };
}
