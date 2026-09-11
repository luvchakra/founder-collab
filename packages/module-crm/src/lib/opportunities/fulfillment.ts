import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import type { FulfillmentRequirement } from "./types";

export const FULFILLMENT_REQUIREMENT_LABEL: Record<FulfillmentRequirement, string> = {
  inventory_required: "Inventory fulfillment required",
  service_only: "Service only",
  product_and_service: "Product + service",
  fulfilled_externally: "Product-only, already fulfilled externally",
  not_required: "No fulfillment required",
};

/**
 * INT-02.1's deterministic default -- never written automatically, only offered as a
 * pre-selected suggestion a human confirms or overrides (`setFulfillmentRequirement()`
 * below is the only thing that ever writes the column). Driven by what's actually
 * attached to the opportunity today (linked Inventory products, an FSM engagement), not
 * by which modules are merely licensed -- a licensed-but-unused module says nothing
 * about what *this* opportunity itself needs.
 */
export function suggestFulfillmentRequirement(hasProducts: boolean, hasFsmEngagement: boolean): FulfillmentRequirement {
  if (hasProducts && hasFsmEngagement) return "product_and_service";
  if (hasProducts) return "inventory_required";
  if (hasFsmEngagement) return "service_only";
  return "not_required";
}

/** Sets the human-confirmed (or overridden) fulfillment requirement -- CRM-owned,
 * audited, no cross-module effect of its own (INT-02.2 is what actually acts on
 * `inventory_required`/`product_and_service`). */
export async function setFulfillmentRequirement(businessId: string, opportunityId: string, value: FulfillmentRequirement): Promise<void> {
  await requirePermission(businessId, "crm_opportunities.manage");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing, error: existingError } = await supabase
    .from("opportunity")
    .select("fulfillment_requirement")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (existingError) throw existingError;

  const { error } = await supabase.from("opportunity").update({ fulfillment_requirement: value }).eq("id", opportunityId).eq("business_id", businessId);
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.fulfillment_requirement_set",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    before: { fulfillment_requirement: existing.fulfillment_requirement },
    after: { fulfillment_requirement: value },
  });
}
