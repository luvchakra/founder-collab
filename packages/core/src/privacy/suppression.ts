import { createHash } from "node:crypto";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";

/** Same normalization as core.email_hash() in SQL -- the two must always agree. */
export function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

/** RLS-scoped check (the caller must belong to the business), for send paths running
 * in a user's session. */
export async function isEmailSuppressed(businessId: string, email: string): Promise<boolean> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("is_email_suppressed", { p_business_id: businessId, p_email: email });
  if (error) throw error;
  return data === true;
}

type Reason = "unsubscribe" | "complaint" | "bounce" | "erasure" | "objection" | "manual";

/** Service-role write, for paths with no user session (unsubscribe link, delivery
 * webhooks). Idempotent. */
export async function addSuppression(businessId: string | null, hash: string, reason: Reason): Promise<void> {
  const { error } = await createAdminClient({ schema: "core" })
    .from("communication_suppressions")
    .insert({ business_id: businessId, email_hash: hash, reason });
  if (error && error.code !== "23505") throw error;
}
