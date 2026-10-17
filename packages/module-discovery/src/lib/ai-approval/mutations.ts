import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { AI_APPROVAL_MODE_PERMISSION, isAiApprovalMode, type AiApprovalMode } from "./types";

/**
 * DISC-AI-APPROVAL-01: changes the business's AI approval mode. Owner/admin only
 * (`business.settings.manage`), checked here and again by RLS. The change is audited by
 * the database trigger `business_settings_log_discovery_ai_approval_mode`, through
 * `core.write_audit_log()`, whichever path made it -- so it is not logged a second time
 * here. An update that matches no row (no settings row, or RLS refused it) is reported as
 * a failure, never as saved.
 */
export async function setAiApprovalMode(businessId: string, mode: AiApprovalMode): Promise<void> {
  if (!isAiApprovalMode(mode)) throw new Error("Choose Review each step or Approve automatically.");
  await requireModule(businessId, "discovery");
  await requirePermission(businessId, AI_APPROVAL_MODE_PERMISSION);

  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core
    .from("business_settings")
    .update({ discovery_ai_approval_mode: mode })
    .eq("business_id", businessId)
    .select("business_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("This setting could not be saved for this business.");
}
