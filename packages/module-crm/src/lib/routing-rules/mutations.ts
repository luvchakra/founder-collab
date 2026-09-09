import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import type { KnownSenderCondition } from "./types";

export type CreateRoutingRuleInput = {
  name: string;
  channelId?: string | null;
  assignToEmployeeId?: string | null;
  priority?: number;
  /** B3's own two real, evaluated conditions (docs/design/crm-module-design.md Part
   * B) -- see lib/routing-rules/evaluate.ts. Business hours are both-or-neither. */
  conditionKnownSender?: KnownSenderCondition;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
};

/** S-1's own skeleton scope, now extended by B3: still no channel-account-driven
 * webhook of its own here -- ingest-inbound-message.ts's own matchRoutingRule()
 * applies these against a real inbound message; this file just persists them. */
export async function createRoutingRule(businessId: string, input: CreateRoutingRuleInput): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("routing_rules").insert({
    business_id: businessId,
    name: input.name,
    channel_id: input.channelId || null,
    assign_to_employee_id: input.assignToEmployeeId || null,
    priority: input.priority ?? 0,
    condition_known_sender: input.conditionKnownSender ?? "any",
    business_hours_start: input.businessHoursStart || null,
    business_hours_end: input.businessHoursEnd || null,
  });
  if (error) throw error;
}

/** See `tickets/mutations.ts#updateTicketStatus`'s own doc comment for why this checks
 * the row actually came back instead of trusting a plain `.update()` with no `.select()`
 * -- RLS silently excludes non-matching rows from an UPDATE rather than erroring. */
export async function setRoutingRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("routing_rules").update({ is_active: isActive }).eq("id", ruleId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This routing rule could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}
