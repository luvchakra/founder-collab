import { registerEventHandler } from "@cofounderai/core/events/registry";
import { createAdminClient } from "../db/admin";

/**
 * Discovery's domain-event subscriptions (00-MASTER-PLAN.md §6 module layout). An
 * explicit function rather than registration at import time: this package declares
 * "sideEffects": false, so a bare `import ".../handlers"` may be tree-shaken away. The
 * drain cron route calls it before draining.
 *
 * privacy.subject_erased -- published by core.erase_subject_by_email() (GDPR Art. 17 /
 * DPDP s.12). Discovery holds its own copies of a person's data (prospect contacts and
 * the outreach sent to them); this erases them through discovery's own SQL function. The
 * payload carries only the email hash.
 */
export function registerDiscoveryEventHandlers(): void {
  registerEventHandler("privacy.subject_erased", async (event) => {
    const emailHash = (event.payload as { email_hash?: unknown }).email_hash;
    if (typeof emailHash !== "string") throw new Error("privacy.subject_erased without email_hash");
    const admin = createAdminClient();
    const { error } = await admin.rpc("erase_subject_by_email_hash", {
      p_business_id: event.business_id,
      p_email_hash: emailHash,
    });
    if (error) throw error;
  });
}
