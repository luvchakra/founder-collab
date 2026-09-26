import { createAdminClient } from "../db/admin";
import type { AiOperation } from "./operation-registry";

/**
 * PLATFORM-P0-10.4 ("AI Feature Kill Switch", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §14) -- the runtime half of `platform.ai_operation_switches`
 * (20260927200000_platform_ai_operation_switches.sql). Both model routers (core's
 * `business-router.ts` and module-discovery's `router.ts`) call this before resolving a
 * model, so switching one operation off stops that one AI feature on every module and
 * every tenant, while the module itself (and every other AI feature) keeps working.
 *
 * Read with the service role: the routers also run with no signed-in user (inbound
 * webhooks, crons), and the table holds nothing sensitive. A failed read never blocks AI
 * -- the switch is an operational control, not an authorization boundary (licences and
 * RLS still are) -- so a transient database error degrades to "enabled", logged.
 */
export async function isAiOperationDisabled(operation: AiOperation): Promise<boolean> {
  try {
    const platform = createAdminClient({ schema: "platform" });
    const { data, error } = await platform
      .from("ai_operation_switches")
      .select("enabled")
      .eq("operation", operation)
      .maybeSingle();
    if (error) throw error;
    return data?.enabled === false;
  } catch (error) {
    console.warn(`[ai/feature-kill-switch] could not read the switch for ${operation}; treating it as enabled`, error);
    return false;
  }
}

export const AI_FEATURE_DISABLED_MESSAGE = "This AI feature is temporarily unavailable. Please try again later.";
