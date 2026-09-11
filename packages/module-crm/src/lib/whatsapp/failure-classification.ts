import type { ChannelConnectionStatus } from "../channel-connections/types";

export type ChannelConnectionFailureStatus = Extract<ChannelConnectionStatus, "reauthorization_required" | "provider_error" | "degraded">;

/**
 * CRM-15.5's failure classifier: maps a Graph API HTTP status (or its absence, on a
 * request that never got a response at all) to the `crm.channel_connection` status it
 * implies -- or `null` when the failure says nothing about the connection's own health.
 *
 * - 401/403: the token itself is no longer valid (expired, revoked, missing a
 *   permission) -- only a fresh token fixes this, so `reauthorization_required`.
 * - 429: Meta's own rate limit -- temporary, self-resolving, so `degraded` rather than
 *   the more alarming `provider_error`.
 * - 5xx, or no status code at all (network failure/timeout -- the request never reached
 *   Meta, or Meta never responded): `provider_error`, Meta's side, not this connection's
 *   own credentials.
 * - Any other 4xx (400 bad recipient, 404 unknown template, ...) is a rejection of that
 *   one message, not a sign the connection itself is unhealthy -- `null`, so a bad phone
 *   number on a single send never flips a perfectly good connection to a failure state.
 */
export function classifyWhatsAppFailure(statusCode: number | undefined): ChannelConnectionFailureStatus | null {
  if (statusCode === 401 || statusCode === 403) return "reauthorization_required";
  if (statusCode === 429) return "degraded";
  if (statusCode === undefined || statusCode >= 500) return "provider_error";
  return null;
}
