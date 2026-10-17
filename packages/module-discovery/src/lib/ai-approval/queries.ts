import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getBusinessIdForWorkspace } from "../tenancy/queries";
import { DEFAULT_AI_APPROVAL_MODE, isAiApprovalMode, type AiApprovalMode } from "./types";

/**
 * DISC-AI-APPROVAL-01: the business's AI approval mode, read through the signed-in user's
 * own session (RLS: members read only their own business's settings row). A business
 * with no settings row, or a value this code doesn't recognise, reads as "review" -- the
 * mode where nothing is approved on the AI's behalf. A failed read throws rather than
 * guessing, so a flow never approves anything on a lookup it couldn't make.
 */
export async function getAiApprovalMode(businessId: string): Promise<AiApprovalMode> {
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core
    .from("business_settings")
    .select("discovery_ai_approval_mode")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  const value = data?.discovery_ai_approval_mode;
  return isAiApprovalMode(value) ? value : DEFAULT_AI_APPROVAL_MODE;
}

/** Same, resolved from the workspace itself (workspace -> offering -> business), so a
 * flow never trusts a business id the caller passed in to decide what it may approve. */
export async function getAiApprovalModeForWorkspace(workspaceId: string): Promise<AiApprovalMode> {
  const businessId = await getBusinessIdForWorkspace(workspaceId);
  if (!businessId) return DEFAULT_AI_APPROVAL_MODE;
  return getAiApprovalMode(businessId);
}
