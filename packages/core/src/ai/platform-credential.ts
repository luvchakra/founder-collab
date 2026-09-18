import { cache } from "react";
import { createAdminClient } from "../db/admin";
import { decryptApiKey } from "../crypto/api-key";
import type { AiProvider } from "./model-registry";

/**
 * The platform's own AI credential — what every business runs on until it brings its own
 * key.
 *
 * Two places can hold one, and until now only the second was ever read:
 *
 *  1. `platform.ai_provider_keys`, set by a superadmin on the Platform Admin portal's
 *     AI Providers page. Encrypted at rest, validated against the provider before it is
 *     stored, and audited with a reason.
 *  2. `PLATFORM_AI_API_KEY`, a deployment environment variable.
 *
 * Both routers (`ai/business-router.ts` and `module-discovery/lib/ai/router.ts`) read only
 * the env var, so a superadmin could configure a key on the admin page, see it saved and
 * validated, and have nothing use it. This is the reader that closes that.
 *
 * The admin-managed key wins because it is the more deliberate act: someone chose a
 * provider in the UI and the platform proved the key worked before storing it. The env var
 * stays as the deployment-level fallback, which is what a fresh environment runs on before
 * anyone has opened the admin page.
 */

export interface PlatformAiCredential {
  provider: AiProvider;
  apiKey: string;
  /** Where it came from, so a caller can say so — "the key you set in Admin" and "the
   * deployment's key" are different things to a superadmin debugging a failure. */
  source: "platform_admin" | "environment";
}

/** Rows as the table holds them, joined to whether the provider is switched on. */
export interface PlatformKeyRow {
  provider: AiProvider;
  encrypted_api_key: string;
  enabled: boolean;
}

/**
 * Which stored key to use.
 *
 * A disabled provider is never chosen, however good its key: `enabled` is the switch a
 * superadmin flips to take a provider out of service, and honouring the key anyway would
 * make that switch a lie.
 *
 * With several enabled, the order is fixed rather than arbitrary — an AI call that picks a
 * different provider run to run is impossible to reason about, and `ai_runs` caching keys
 * on the model would thrash. Anthropic first because that is what the env-var fallback has
 * always assumed, so behaviour does not change for a deployment that has both.
 */
const PROVIDER_PRIORITY: AiProvider[] = ["anthropic", "openai", "google"];

export function selectPlatformKey(rows: PlatformKeyRow[]): PlatformKeyRow | null {
  const usable = rows.filter((row) => row.enabled && row.encrypted_api_key);
  for (const provider of PROVIDER_PRIORITY) {
    const match = usable.find((row) => row.provider === provider);
    if (match) return match;
  }
  // A provider this build doesn't rank is still a configured, enabled key — better to use
  // it than to fail as though nothing were configured.
  return usable[0] ?? null;
}

function environmentCredential(): PlatformAiCredential | null {
  const apiKey = process.env.PLATFORM_AI_API_KEY;
  if (!apiKey) return null;
  return { provider: "anthropic", apiKey, source: "environment" };
}

/**
 * Cached per request: several AI operations in one request would otherwise each hit the
 * database and each decrypt the same key.
 *
 * Service-role, because `platform.ai_provider_keys` grants `authenticated` nothing at all
 * — by design, since it holds a live provider credential.
 */
export const getPlatformAiCredential = cache(async (): Promise<PlatformAiCredential | null> => {
  try {
    const supabase = createAdminClient({ schema: "platform" });
    const [{ data: keys, error }, { data: providers, error: providerError }] = await Promise.all([
      supabase.from("ai_provider_keys").select("provider, encrypted_api_key"),
      supabase.from("ai_providers").select("provider, enabled"),
    ]);
    if (error || providerError) throw error ?? providerError;

    const enabledBy = new Map(
      ((providers ?? []) as { provider: string; enabled: boolean }[]).map((p) => [p.provider, p.enabled]),
    );
    const rows: PlatformKeyRow[] = ((keys ?? []) as { provider: AiProvider; encrypted_api_key: string }[]).map(
      (row) => ({ ...row, enabled: enabledBy.get(row.provider) ?? false }),
    );

    const chosen = selectPlatformKey(rows);
    if (chosen) {
      return { provider: chosen.provider, apiKey: decryptApiKey(chosen.encrypted_api_key), source: "platform_admin" };
    }
  } catch (cause) {
    // A missing service-role key, an unreachable database, or an encryption secret that no
    // longer decrypts what was stored: all real, and none of them a reason to lose the
    // environment fallback that would otherwise have worked. Logged rather than thrown,
    // because the caller's question is "is there a key", not "why isn't there".
    console.warn("[ai] Could not read the platform AI key from Platform Admin; falling back to PLATFORM_AI_API_KEY.", cause);
  }

  return environmentCredential();
});
