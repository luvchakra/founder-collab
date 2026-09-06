import { createClient } from "../../db/server";
import { encryptApiKey, fingerprintApiKey } from "@cofounderai/core/crypto/api-key";
import { testProviderConnection } from "@cofounderai/core/ai-providers/test-connection";
import type { AiProvider } from "./types";

/**
 * Connects (or replaces) the account's single AI provider credential
 * (docs/byok-ai-requirements.md §11 scope: one connection per account, covering every
 * business/product under it). Tests the key server-side before saving anything -- a
 * rejected key is never persisted, so `ai_provider_credentials` never holds a key that
 * failed its very first validation.
 *
 * Throws with the provider's rejection reason on failure; the caller (the settings
 * form action) surfaces that message inline rather than saving a broken connection.
 */
export async function connectAiProvider(
  accountId: string,
  provider: AiProvider,
  apiKey: string,
): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) throw new Error("API key is required.");

  const result = await testProviderConnection(provider, trimmed);
  if (!result.ok) throw new Error(result.error);

  const supabase = await createClient();
  const { error } = await supabase.from("ai_provider_credentials").upsert(
    {
      account_id: accountId,
      provider,
      encrypted_api_key: encryptApiKey(trimmed),
      key_fingerprint: fingerprintApiKey(trimmed),
      status: "connected",
      last_validated_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "account_id" },
  );
  if (error) throw error;
}

export async function disconnectAiProvider(accountId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_provider_credentials")
    .delete()
    .eq("account_id", accountId);
  if (error) throw error;
}
