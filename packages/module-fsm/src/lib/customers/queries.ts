import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { FsmCustomer } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** `/fsm/customers` (PRD §5) -- every `core.parties` row holding the `customer` role
 * for this business, with each one's own open job/opportunity counts (the "module-
 * appropriate columns" the PRD's own route description asks for, distinct from
 * inventory's sales-figure columns on the same underlying rows). Same "no PostgREST
 * embed, join in JS" pattern as every other list query in this module -- `party_roles`
 * has no embed target back onto `parties`. */
export const listFsmCustomers = cache(async (businessId: string): Promise<FsmCustomer[]> => {
  const core = await coreClient();
  const { data: roles, error: rolesError } = await core
    .from("party_roles")
    .select("party_id")
    .eq("business_id", businessId)
    .eq("role", "customer");
  if (rolesError) throw rolesError;
  if (roles.length === 0) return [];

  const partyIds = roles.map((r) => r.party_id);
  const { data: parties, error: partiesError } = await core
    .from("parties")
    .select("id, name, email, phone, is_active, created_at")
    .in("id", partyIds)
    .order("name");
  if (partiesError) throw partiesError;

  const fsm = await createClient();
  const [jobCounts, opportunityCounts] = await Promise.all([
    fsm.from("jobs").select("party_id").eq("business_id", businessId).in("party_id", partyIds).not("status", "in", "(completed,cancelled)"),
    fsm.from("opportunities").select("party_id").eq("business_id", businessId).in("party_id", partyIds).not("status", "in", "(won,lost)"),
  ]);
  if (jobCounts.error) throw jobCounts.error;
  if (opportunityCounts.error) throw opportunityCounts.error;

  const jobCountByParty = new Map<string, number>();
  for (const row of jobCounts.data) jobCountByParty.set(row.party_id, (jobCountByParty.get(row.party_id) ?? 0) + 1);
  const opportunityCountByParty = new Map<string, number>();
  for (const row of opportunityCounts.data) opportunityCountByParty.set(row.party_id, (opportunityCountByParty.get(row.party_id) ?? 0) + 1);

  return parties.map((p) => ({
    ...p,
    open_job_count: jobCountByParty.get(p.id) ?? 0,
    open_opportunity_count: opportunityCountByParty.get(p.id) ?? 0,
  }));
});
