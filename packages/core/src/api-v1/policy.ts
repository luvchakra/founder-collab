import { createAdminClient } from "../db/admin";

/**
 * PLATFORM-P1-06.1/06.3 -- the platform's API and webhook policy as the request paths see
 * it: the per-minute limit from platform.system_policies (PLATFORM-P0-14.3) and the burst,
 * payload and webhook settings from platform.api_policies
 * (20260927203000_platform_api_policies.sql). Read with the service role (API and webhook
 * requests have no session) and cached for a short while per server instance, so a busy
 * API doesn't pay two extra reads per request; a policy change reaches every instance
 * within that window. A read failure falls back to the defaults below -- the same values
 * the platform enforced before these settings existed.
 */

export type ApiPolicy = {
  rateLimitPerMinute: number;
  burstLimitPerSecond: number;
  maxPayloadKb: number;
  webhookMaxRetries: number;
  webhookTimeoutSeconds: number;
  webhookSignatureToleranceSeconds: number;
};

export const DEFAULT_API_POLICY: ApiPolicy = {
  rateLimitPerMinute: 120,
  burstLimitPerSecond: 20,
  maxPayloadKb: 1024,
  webhookMaxRetries: 8,
  webhookTimeoutSeconds: 600,
  webhookSignatureToleranceSeconds: 300,
};

const CACHE_MS = 30_000;
let cached: { at: number; policy: ApiPolicy } | null = null;

export function toApiPolicy(policyRow: Record<string, unknown> | null, systemRow: Record<string, unknown> | null): ApiPolicy {
  const d = DEFAULT_API_POLICY;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    rateLimitPerMinute: num(systemRow?.rate_limit_api_per_minute, d.rateLimitPerMinute),
    burstLimitPerSecond: num(policyRow?.burst_limit_per_second, d.burstLimitPerSecond),
    maxPayloadKb: num(policyRow?.max_payload_kb, d.maxPayloadKb),
    webhookMaxRetries: num(policyRow?.webhook_max_retries, d.webhookMaxRetries),
    webhookTimeoutSeconds: num(policyRow?.webhook_timeout_seconds, d.webhookTimeoutSeconds),
    webhookSignatureToleranceSeconds: num(policyRow?.webhook_signature_tolerance_seconds, d.webhookSignatureToleranceSeconds),
  };
}

export async function loadApiPolicy(now: number = Date.now()): Promise<ApiPolicy> {
  if (cached && now - cached.at < CACHE_MS) return cached.policy;
  try {
    const platform = createAdminClient({ schema: "platform" });
    const [policy, system] = await Promise.all([
      platform.from("api_policies").select("*").eq("id", true).maybeSingle(),
      platform.from("system_policies").select("rate_limit_api_per_minute").eq("id", true).maybeSingle(),
    ]);
    if (policy.error) throw policy.error;
    if (system.error) throw system.error;
    cached = { at: now, policy: toApiPolicy(policy.data as Record<string, unknown> | null, system.data as Record<string, unknown> | null) };
    return cached.policy;
  } catch (error) {
    console.warn("[api-v1/policy] falling back to the default API policy", error);
    return DEFAULT_API_POLICY;
  }
}

/** Test hook: forget the cached policy. */
export function clearApiPolicyCache(): void {
  cached = null;
}

/** PLATFORM-P1-06.1 -- pure: is a request body larger than the policy allows? */
export function exceedsPayloadLimit(bytes: number, maxPayloadKb: number): boolean {
  return bytes > maxPayloadKb * 1024;
}

/** The body size of a request: its Content-Length when declared, otherwise measured. */
export async function requestBodyBytes(request: Request): Promise<number> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 0) return declared;
  if (request.method === "GET" || request.method === "HEAD" || !request.body) return 0;
  return (await request.clone().arrayBuffer()).byteLength;
}

/** PLATFORM-P1-06.4 / 07.2 -- count an API error (status only, nothing about the caller).
 * Fire-and-forget: a failed count never affects the response. */
export function recordApiError(status: number): void {
  if (status < 400 || status > 599) return;
  try {
    void createAdminClient({ schema: "platform" })
      .rpc("record_api_error", { p_status_code: status })
      .then(({ error }) => {
        if (error) console.warn("[api-v1/policy] could not record an API error", error.message);
      });
  } catch (error) {
    console.warn("[api-v1/policy] could not record an API error", error);
  }
}
