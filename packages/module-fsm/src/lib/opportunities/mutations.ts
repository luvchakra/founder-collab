import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import type { CreateOpportunityInput, UpdateOpportunityInput } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Resolves a party -- either the existing one given, or a brand-new `core.parties` row
 * created inline. Either way, ensures the party holds the `customer` role (idempotent:
 * `party_roles`' own `unique (party_id, role)` means "already has it" is a normal,
 * ignorable outcome, not an error) -- the party might not have been a `customer` yet (per
 * the entity-ownership map, winning a prospect ADDS the role rather than copying a
 * record; creating an opportunity or job directly against a brand-new party works the
 * same way). Exported so jobs/mutations.ts's own `createJob()` (F-5) can reuse the exact
 * same resolution instead of duplicating it -- both take the same
 * `{partyId?, newCustomer?}` shape. */
export async function resolveCustomerPartyId(
  businessId: string,
  input: { partyId?: string; newCustomer?: { name: string; email?: string; phone?: string } },
): Promise<string> {
  const core = await coreClient();

  let partyId = input.partyId;
  if (!partyId) {
    if (!input.newCustomer?.name.trim()) {
      throw new Error("A customer is required: pick an existing one or provide a name for a new one.");
    }
    const { data: party, error } = await core
      .from("parties")
      .insert({
        business_id: businessId,
        kind: "company",
        name: input.newCustomer.name.trim(),
        email: input.newCustomer.email || null,
        phone: input.newCustomer.phone || null,
      })
      .select("id")
      .single();
    if (error) throw error;
    partyId = party.id;
  }

  if (!partyId) throw new Error("Could not resolve a customer for this opportunity.");
  const resolvedPartyId: string = partyId;

  const { error: roleError } = await core
    .from("party_roles")
    .insert({ business_id: businessId, party_id: resolvedPartyId, role: "customer" });
  // Unique violation (23505) just means the party already holds the role -- expected
  // and fine, not a real failure.
  if (roleError && roleError.code !== "23505") throw roleError;

  return resolvedPartyId;
}

/** `requireModule()` (defense in depth, CLAUDE.md's licensing architecture section --
 * see its own doc comment) called here as this module's demonstrated call site: the
 * PRD's own pipeline entry point ("the entry point," §1), the first write a founder
 * makes in fsm. RLS still rejects the insert either way if this somehow passed
 * incorrectly -- this only turns that into a clearer message first. */
export async function createOpportunity(businessId: string, input: CreateOpportunityInput): Promise<string> {
  await requireModule(businessId, "fsm");
  const partyId = await resolveCustomerPartyId(businessId, input);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      business_id: businessId,
      party_id: partyId,
      service_type_id: input.serviceTypeId || null,
      description: input.description?.trim() || null,
      scope_of_work: input.scopeOfWork?.trim() || null,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateOpportunity(id: string, businessId: string, patch: UpdateOpportunityInput): Promise<void> {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if ("serviceTypeId" in patch) update.service_type_id = patch.serviceTypeId;
  if ("description" in patch) update.description = patch.description;
  if ("scopeOfWork" in patch) update.scope_of_work = patch.scopeOfWork;

  const { error } = await supabase.from("opportunities").update(update).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

/** "Nothing auto-advances to Lost. Human intent is required" (PRD §1's own design
 * lesson) -- this is the only way an opportunity's status ever becomes `lost`, and the
 * table's own check constraint (`status <> 'lost' or lost_reason is not null`) backs it
 * up at the database level regardless of what application code does. */
export async function markOpportunityLost(id: string, businessId: string, reason: string): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to mark an opportunity lost.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "lost", lost_reason: trimmed })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
}

/** Reopening a lost opportunity back to `new` -- the PRD's own state machine (§4) only
 * documents `won -> new` as an explicit "undo" transition (gated on the job having no
 * events/charges yet, which doesn't exist until F-5's jobs land); reopening from `lost`
 * isn't itself a documented transition, but is the obvious, low-risk corollary of
 * "nothing auto-advances to Lost, human intent required" -- the same intent
 * requirement applies just as well to undoing a mistaken one. */
export async function reopenLostOpportunity(id: string, businessId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "new", lost_reason: null })
    .eq("id", id)
    .eq("business_id", businessId)
    .eq("status", "lost");
  if (error) throw error;
}
