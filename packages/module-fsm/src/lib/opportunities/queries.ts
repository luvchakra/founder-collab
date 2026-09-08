import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { CustomerOption, Opportunity, OpportunityListItem } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Ported-pattern (module-inventory's own precedent, e.g. purchase-orders/queries.ts):
 * `fsm.opportunities.party_id`/`service_type_id` have no PostgREST embed target (a
 * cross-schema FK to `core.parties` and an in-schema FK to `fsm.service_types`, neither
 * exposed for embedding) -- joined here in JS instead. */
export const listOpportunities = cache(async (businessId: string): Promise<OpportunityListItem[]> => {
  const supabase = await createClient();
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (opportunities.length === 0) return [];

  const core = await coreClient();
  const partyIds = [...new Set(opportunities.map((o) => o.party_id))];
  const serviceTypeIds = [...new Set(opportunities.map((o) => o.service_type_id).filter((id): id is string => Boolean(id)))];

  const [partiesRes, serviceTypesRes] = await Promise.all([
    core.from("parties").select("id, name").in("id", partyIds),
    serviceTypeIds.length
      ? supabase.from("service_types").select("id, name").in("id", serviceTypeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (partiesRes.error) throw partiesRes.error;
  if (serviceTypesRes.error) throw serviceTypesRes.error;

  const partyById = new Map(partiesRes.data.map((p) => [p.id, p.name]));
  const serviceTypeById = new Map(serviceTypesRes.data.map((s) => [s.id, s.name]));

  return opportunities.map((o) => ({
    ...o,
    party_name: partyById.get(o.party_id) ?? "Unknown customer",
    service_type_name: o.service_type_id ? (serviceTypeById.get(o.service_type_id) ?? null) : null,
  }));
});

/** `businessId` here is a "which of my businesses" filter, not the authorization check
 * (RLS is) -- it exists so a caller who's a member of more than one business can't have
 * a detail page render another one of their own businesses' opportunities under the
 * wrong active-business context, same reasoning as module-inventory's own precedent. */
export const getOpportunity = cache(async (businessId: string, id: string): Promise<Opportunity | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** Party name + service type name for one opportunity's detail page -- same "no embed"
 * join-in-JS reasoning as listOpportunities() above, just for a single row. */
export const getOpportunityContext = cache(
  async (opportunity: Opportunity): Promise<{ partyName: string; serviceTypeName: string | null }> => {
    const core = await coreClient();
    const { data: party, error: partyError } = await core
      .from("parties")
      .select("name")
      .eq("id", opportunity.party_id)
      .maybeSingle();
    if (partyError) throw partyError;

    let serviceTypeName: string | null = null;
    if (opportunity.service_type_id) {
      const supabase = await createClient();
      const { data: serviceType, error: serviceTypeError } = await supabase
        .from("service_types")
        .select("name")
        .eq("id", opportunity.service_type_id)
        .maybeSingle();
      if (serviceTypeError) throw serviceTypeError;
      serviceTypeName = serviceType?.name ?? null;
    }

    return { partyName: party?.name ?? "Unknown customer", serviceTypeName };
  },
);

/** Any party for the business, regardless of role -- an opportunity's customer may not
 * hold the `customer` role yet (createOpportunity() attaches it if missing), so this
 * isn't filtered to parties that already have it. */
export const listCustomerOptions = cache(async (businessId: string): Promise<CustomerOption[]> => {
  const core = await coreClient();
  const { data, error } = await core
    .from("parties")
    .select("id, name, email, phone")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
});
