import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createAdminClient as createFsmAdminClient } from "../../db/admin";
import type { WorkRequestInput } from "./types";

/** The public contact form's one write (PRD §2 Contact form row MUST: "embeddable/public
 * form -> creates an inbound work request -> opportunity"). Re-checks licensing and
 * `contact_form_enabled` itself rather than trusting the page's earlier check (this is a
 * server action a client could call directly) -- same defense-in-depth reasoning as
 * `requireModule()` everywhere else in the platform, just re-implemented against the
 * admin client since there's no session to run `requireModule()`'s usual RLS-backed
 * check against.
 *
 * Runs with the admin client throughout (no signed-in user on a public form) --
 * `fsm.opportunities.created_by` has no "system" user to attribute to, so it's set to
 * the business's own owner, the same attribution a business-wide automated action
 * reasonably takes. */
export async function submitWorkRequest(businessId: string, input: WorkRequestInput): Promise<{ opportunityId: string }> {
  if (!input.name.trim()) throw new Error("A name is required.");

  const core = createCoreAdminClient({ schema: "core" });
  const { data: licensed } = await core.rpc("has_module", { p_business_id: businessId, p_key: "fsm" });
  if (!licensed) throw new Error("This form isn't available right now.");

  const fsm = createFsmAdminClient();
  const { data: fsmSettings } = await fsm.from("settings").select("contact_form_enabled").eq("business_id", businessId).maybeSingle();
  if (!fsmSettings?.contact_form_enabled) throw new Error("This form isn't available right now.");

  const { data: owner, error: ownerError } = await core
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) throw new Error("This form isn't available right now.");

  let partyId: string | undefined;
  if (input.email) {
    const { data: existing } = await core.from("parties").select("id").eq("business_id", businessId).eq("email", input.email).maybeSingle();
    partyId = existing?.id;
  }
  if (!partyId) {
    const { data: party, error: partyError } = await core
      .from("parties")
      .insert({ business_id: businessId, kind: "company", name: input.name.trim(), email: input.email || null, phone: input.phone || null })
      .select("id")
      .single();
    if (partyError) throw partyError;
    partyId = party.id;
  }

  const { data: opportunity, error: oppError } = await fsm
    .from("opportunities")
    .insert({
      business_id: businessId,
      party_id: partyId,
      description: input.message?.trim() || null,
      scope_of_work: input.message?.trim() || null,
      source: "contact_form",
      created_by: owner.user_id,
    })
    .select("id")
    .single();
  if (oppError) throw oppError;

  const { error: workRequestError } = await fsm.from("work_requests").insert({
    business_id: businessId,
    raw: input,
    name: input.name.trim(),
    email: input.email || null,
    phone: input.phone || null,
    address_text: input.addressText || null,
    message: input.message || null,
    status: "converted",
    opportunity_id: opportunity.id,
  });
  if (workRequestError) throw workRequestError;

  return { opportunityId: opportunity.id };
}
