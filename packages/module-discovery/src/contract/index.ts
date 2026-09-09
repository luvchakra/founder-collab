import { hasModule } from "@cofounderai/core/licensing/queries";
import { addPartyContact, addPartyRole } from "@cofounderai/core/parties/mutations";
import { getFirstWorkspaceForBusiness, getProduct, getWorkspace } from "../lib/tenancy/queries";
import { createProspect } from "../lib/prospects/mutations";
import { createClient } from "../db/server";
import type { ContractProspectSummary, ContractResult, CreateProspectFromExternalLeadInput } from "./types";

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

  return {
    ok: true,
    data: {
      prospectId: prospect.id,
      productName: product?.name ?? "Unknown product",
      status: prospect.status,
      outcome: prospect.outcome,
    },
  };
}
