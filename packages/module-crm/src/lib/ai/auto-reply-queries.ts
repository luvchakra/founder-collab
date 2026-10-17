import { createClient } from "../../db/server";
import type { AutoReplySkipReason } from "./auto-reply-core";

/** PLATFORM-P1-12.5/12.6: what happened to the automatic reply for one inbound message, for
 * the signed-in person (RLS: tenant AND licensed). Null when none was attempted. */
export type AutoReplyStatus = { status: "requested" | "sent" | "failed" | "skipped"; reason: AutoReplySkipReason | "send_failed" | null };

export async function getAutoReplyForInteraction(businessId: string, interactionId: string): Promise<AutoReplyStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_auto_replies")
    .select("status, reason")
    .eq("business_id", businessId)
    .eq("interaction_id", interactionId)
    .maybeSingle();
  if (error) throw error;
  return (data as AutoReplyStatus | null) ?? null;
}
