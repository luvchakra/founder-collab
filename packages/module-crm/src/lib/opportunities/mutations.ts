import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import { DEFAULT_OPPORTUNITY_STAGES } from "./types";
import type { OpportunityStage } from "./types";

/** CRM-04.2: "Stage configuration stored at business level." Lazily provisions the
 * default pipeline the first time a business's Opportunities page is opened -- there's
 * no license-activation hook in this codebase that seeds per-module defaults, and
 * provisioning on first real use avoids needing one. Idempotent: a business that
 * already has any stage rows is left alone (a founder may have already customized
 * them), not reset. */
export async function ensureDefaultStages(businessId: string): Promise<OpportunityStage[]> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("opportunity_stage")
    .select("*")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  if (existingError) throw existingError;
  if (existing.length > 0) return existing as OpportunityStage[];

  const rows = DEFAULT_OPPORTUNITY_STAGES.map((stage, index) => ({
    business_id: businessId,
    key: stage.key,
    name: stage.name,
    sort_order: index,
    is_won: stage.isWon ?? false,
    is_lost: stage.isLost ?? false,
  }));
  const { data: created, error: createError } = await supabase.from("opportunity_stage").insert(rows).select("*");
  if (createError) throw createError;
  return created as OpportunityStage[];
}

/**
 * CRM-04.2: "Drag/drop stage change with audit event." Also flips `status` to
 * `won`/`lost` when the target stage is terminal, and back to `open` when dragged out
 * of one -- an opportunity's status should never say `won` while sitting in a
 * non-terminal stage or vice versa. Publishes `crm.opportunity.stage_changed`
 * (CRM-01.4) and, on a terminal transition, `crm.opportunity.won`/`crm.opportunity.lost`.
 */
export async function updateOpportunityStage(businessId: string, opportunityId: string, stageId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: opportunity, error: opportunityError } = await supabase
    .from("opportunity")
    .select("stage_id")
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .single();
  if (opportunityError) throw opportunityError;

  const { data: stage, error: stageError } = await supabase
    .from("opportunity_stage")
    .select("is_won, is_lost")
    .eq("id", stageId)
    .eq("business_id", businessId)
    .single();
  if (stageError) throw stageError;

  const status = stage.is_won ? "won" : stage.is_lost ? "lost" : "open";

  const { error: updateError } = await supabase.from("opportunity").update({ stage_id: stageId, status }).eq("id", opportunityId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_opportunity.stage_changed",
    entityType: "crm_opportunity",
    entityId: opportunityId,
    before: { stage_id: opportunity.stage_id },
    after: { stage_id: stageId },
  });

  await publishCrmEvent(businessId, "crm.opportunity.stage_changed", {
    v: 1,
    opportunityId,
    fromStageId: opportunity.stage_id,
    toStageId: stageId,
  });
  if (stage.is_won) await publishCrmEvent(businessId, "crm.opportunity.won", { v: 1, opportunityId });
  if (stage.is_lost) await publishCrmEvent(businessId, "crm.opportunity.lost", { v: 1, opportunityId, reason: null });
}
