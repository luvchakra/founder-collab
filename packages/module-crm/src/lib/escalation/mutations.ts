import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { getEscalationConfig } from "./queries";
import type { EscalationConfig, EscalationStage } from "./types";

/** CRM-09.8's own configurable "manager" designation (confirmed with the user: a
 * distinct per-business setting, not a reuse of the owner/admin RBAC roles). Upserts
 * so the first customization for a business creates its `escalation_config` row. */
export async function setEscalationManager(businessId: string, employeeId: string | null): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm_settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("escalation_config").upsert({ business_id: businessId, manager_employee_id: employeeId }, { onConflict: "business_id" });
  if (error) throw error;
}

const STAGE_RANK: Record<EscalationStage, number> = { reminder: 1, owner_escalation: 2, manager_escalation: 3 };

/** Pure -- which stage (if any) an interaction unresolved for this many minutes has
 * reached, per the business's own configured delays. Highest-first so an interaction
 * that's been open long enough to skip straight to `manager_escalation` (e.g. the sweep
 * missed a run) lands on the right stage immediately rather than needing several sweeps
 * to climb one rung at a time. */
export function computeTargetEscalationStage(elapsedMinutes: number, config: Pick<EscalationConfig, "reminderDelayMinutes" | "ownerEscalationDelayMinutes" | "managerEscalationDelayMinutes">): EscalationStage | null {
  if (elapsedMinutes >= config.managerEscalationDelayMinutes) return "manager_escalation";
  if (elapsedMinutes >= config.ownerEscalationDelayMinutes) return "owner_escalation";
  if (elapsedMinutes >= config.reminderDelayMinutes) return "reminder";
  return null;
}

/**
 * CRM-09.8's engine: given one still-open commercial interaction, climbs its
 * escalation follow-up (a `crm.follow_up` row, same "review carries no party/lead/
 * opportunity/conversation" reasoning as CRM-08.7's own review-recovery task, except
 * here `conversation_id` is always available) to whatever stage `computeTargetEscalation
 * Stage()` says it's reached -- never backward, never past what's already recorded
 * (`STAGE_RANK` comparison). Confirmed with the user: state changes only --
 * `reminder`/`owner_escalation` bump priority (owner_id left as the conversation's own
 * current owner, since there is no well-defined "default owner" to invent for an
 * unassigned conversation); `manager_escalation` additionally assigns the business's
 * configured `manager_employee_id`, if one is set -- if not, the stage still advances
 * (recorded honestly) but nothing gets assigned, since there is nobody to assign to.
 *
 * No permission gate: this is a system-driven primitive the cron sweep below calls with
 * no session, the same "shared primitive both a human action and a session-less caller
 * use" pattern `createLead()`'s own doc comment already established -- there is no
 * human-triggered call site for this function at all, so there is nothing to gate.
 */
export async function applyEscalationRules(businessId: string, interactionId: string, config: EscalationConfig, client?: SupabaseClient): Promise<{ stage: EscalationStage | null; changed: boolean }> {
  const supabase = client ?? (await createClient());

  const { data: interaction, error: interactionError } = await supabase
    .from("interaction")
    .select("occurred_at, conversation_id, requires_response, responded_at")
    .eq("id", interactionId)
    .eq("business_id", businessId)
    .single();
  if (interactionError) throw interactionError;
  if (!interaction.requires_response || interaction.responded_at) return { stage: null, changed: false };

  const elapsedMinutes = (Date.now() - new Date(interaction.occurred_at).getTime()) / 60_000;
  const target = computeTargetEscalationStage(elapsedMinutes, config);
  if (!target) return { stage: null, changed: false };

  const { data: conversation, error: conversationError } = await supabase.from("conversation").select("party_id, assigned_to").eq("id", interaction.conversation_id).eq("business_id", businessId).single();
  if (conversationError) throw conversationError;

  const { data: existing, error: existingError } = await supabase.from("follow_up").select("id, escalation_stage").eq("business_id", businessId).eq("interaction_id", interactionId).maybeSingle();
  if (existingError) throw existingError;

  const priority = target === "reminder" ? "normal" : "high";
  const ownerId = target === "manager_escalation" ? config.managerEmployeeId : conversation.assigned_to;

  if (!existing) {
    const { error: insertError } = await supabase.from("follow_up").insert({
      business_id: businessId,
      interaction_id: interactionId,
      conversation_id: interaction.conversation_id,
      party_id: conversation.party_id,
      owner_id: ownerId,
      due_at: new Date().toISOString(),
      priority,
      escalation_stage: target,
    });
    if (insertError) throw insertError;
    return { stage: target, changed: true };
  }

  if (STAGE_RANK[target] <= STAGE_RANK[existing.escalation_stage as EscalationStage]) return { stage: existing.escalation_stage as EscalationStage, changed: false };

  const { error: updateError } = await supabase.from("follow_up").update({ priority, owner_id: ownerId, escalation_stage: target }).eq("id", existing.id).eq("business_id", businessId);
  if (updateError) throw updateError;
  return { stage: target, changed: true };
}

/**
 * Cron entry point: every still-open commercial interaction (`requires_response` and
 * not yet answered -- the same population `getOpenCommercialInteractions()` already
 * defines, here queried admin-scoped and across every business at once since a cron
 * invocation has no single business's session) across every business with an *active*
 * `crm` license (grace-period businesses get reads, not this kind of write, per ADR-9 --
 * checked directly against `core.licenses` with the admin client rather than the
 * session-bound `core.write_licensed_business_ids()` RLS helper, which has no `auth.uid()`
 * to resolve here).
 */
export async function runEscalationSweep(): Promise<{ checked: number; escalated: number }> {
  const crmAdmin = createAdminClient();
  const coreAdmin = createCoreAdminClient({ schema: "core" });

  const { data: licensedBusinesses, error: licenseError } = await coreAdmin.from("licenses").select("business_id").eq("module_key", "crm").eq("status", "active");
  if (licenseError) throw licenseError;
  const businessIds = [...new Set((licensedBusinesses ?? []).map((l) => l.business_id as string))];
  if (businessIds.length === 0) return { checked: 0, escalated: 0 };

  const { data: interactions, error: interactionsError } = await crmAdmin
    .from("interaction")
    .select("id, business_id")
    .in("business_id", businessIds)
    .eq("requires_response", true)
    .is("responded_at", null);
  if (interactionsError) throw interactionsError;
  if (!interactions || interactions.length === 0) return { checked: 0, escalated: 0 };

  const configByBusinessId = new Map<string, EscalationConfig>();
  let escalated = 0;
  for (const row of interactions) {
    let config = configByBusinessId.get(row.business_id);
    if (!config) {
      config = await getEscalationConfig(row.business_id, crmAdmin);
      configByBusinessId.set(row.business_id, config);
    }
    const result = await applyEscalationRules(row.business_id, row.id, config, crmAdmin);
    if (result.changed) escalated += 1;
  }

  return { checked: interactions.length, escalated };
}
