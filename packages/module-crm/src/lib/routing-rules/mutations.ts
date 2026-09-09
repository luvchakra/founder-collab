import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";

export type CreateRoutingRuleInput = {
  name: string;
  channelId?: string | null;
  assignToEmployeeId?: string | null;
  priority?: number;
};

/** S-1's own skeleton scope: structure only, no actual routing engine that applies
 * these rules to an incoming message -- that's the real unified-inbox feature, a later
 * story. */
export async function createRoutingRule(businessId: string, input: CreateRoutingRuleInput): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("routing_rules").insert({
    business_id: businessId,
    name: input.name,
    channel_id: input.channelId || null,
    assign_to_employee_id: input.assignToEmployeeId || null,
    priority: input.priority ?? 0,
  });
  if (error) throw error;
}

export async function setRoutingRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("routing_rules").update({ is_active: isActive }).eq("id", ruleId);
  if (error) throw error;
}
