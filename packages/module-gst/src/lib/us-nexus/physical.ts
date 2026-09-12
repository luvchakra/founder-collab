import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isJurisdictionSupported } from "../compliance/jurisdictions";
import type { PhysicalNexusFact, PhysicalPresenceType } from "./types";

/** COMPLY-P1-02.3 (Physical Nexus Inputs). */

function mapRow(row: {
  id: string;
  business_id: string;
  state: string;
  presence_type: string;
  notes: string | null;
  declared_at: string;
}): PhysicalNexusFact {
  return {
    id: row.id,
    businessId: row.business_id,
    state: row.state,
    presenceType: row.presence_type as PhysicalPresenceType,
    notes: row.notes,
    declaredAt: row.declared_at,
  };
}

/** Every currently-ACTIVE (not-yet-ended) physical nexus fact this business has declared,
 * across every state -- the input `lib/us-nexus/obligations.ts`'s own orchestrator needs to
 * know which states already have a confirmed physical presence. */
export async function listActiveUsPhysicalNexusFacts(businessId: string): Promise<PhysicalNexusFact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("us_physical_nexus_facts")
    .select("id, business_id, state, presence_type, notes, declared_at")
    .eq("business_id", businessId)
    .is("ended_at", null)
    .order("declared_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Whether this business has ANY active physical-presence fact declared for `state` --
 * the one boolean `lib/us-nexus/obligations.ts` actually needs per state; `true`/`false`
 * only (never `null`/unknown) since the absence of a declared fact is itself the "no known
 * physical nexus" answer, not "unknown" -- a business that HAS physical presence somewhere
 * is expected to have declared it (unlike a NUMBER like sales-to-date, which a business may
 * simply not have entered yet). */
export async function hasActiveUsPhysicalNexus(businessId: string, state: string): Promise<boolean> {
  const facts = await listActiveUsPhysicalNexusFacts(businessId);
  return facts.some((f) => f.state === state);
}

/**
 * Declares a new physical-presence fact for a business. Validates `state` against
 * `lib/compliance/jurisdictions.ts`'s own US catalog (COMPLY-P1-02.1) -- the same
 * "validate jurisdiction in application code, not a DB enum" convention every other
 * jurisdiction-shaped write in this module already follows.
 */
export async function declareUsPhysicalNexusFact(
  businessId: string,
  input: { state: string; presenceType: PhysicalPresenceType; notes?: string | null },
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  if (!isJurisdictionSupported("US", input.state)) {
    throw new Error(`"${input.state}" isn't a recognized US state code.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("us_physical_nexus_facts").insert({
    business_id: businessId,
    state: input.state,
    presence_type: input.presenceType,
    notes: input.notes ?? null,
  });
  if (error) throw error;
}

/** Marks a physical-presence fact as ended (e.g. a closed warehouse) -- never deletes the
 * row, preserving the historical record of when this business DID have physical nexus
 * there (backlog rule 13). */
export async function endUsPhysicalNexusFact(businessId: string, factId: string, endedAt: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "settings.manage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("us_physical_nexus_facts")
    .update({ ended_at: endedAt })
    .eq("business_id", businessId)
    .eq("id", factId);
  if (error) throw error;
}
