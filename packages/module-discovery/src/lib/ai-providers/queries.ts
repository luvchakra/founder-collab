import { createClient } from "../../db/server";
import type { AiProviderConnection } from "./types";

/**
 * UI-facing read layer for the account's AI provider connection. Deliberately never
 * selects encrypted_api_key -- per the schema migration's comment, only
 * lib/ai/router.ts's internal credential lookup does that, immediately before
 * decrypting for a single request.
 */
export async function getAiProviderConnection(
  accountId: string,
): Promise<AiProviderConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_provider_credentials")
    .select("provider, key_fingerprint, status, last_validated_at, last_error")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    provider: data.provider,
    keyFingerprint: data.key_fingerprint,
    status: data.status,
    lastValidatedAt: data.last_validated_at,
    lastError: data.last_error,
  };
}
