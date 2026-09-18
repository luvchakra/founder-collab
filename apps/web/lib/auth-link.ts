/** The query a Supabase auth email link carries, whatever shape it arrives in. */
export type AuthLinkParams = {
  code?: string;
  token_hash?: string;
  type?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  next?: string;
};

/**
 * Builds the /auth/callback query for an auth link that landed somewhere that cannot
 * consume it, or null when there is no link in the URL at all.
 *
 * Supabase only honours the `redirectTo` an app asks for if it matches the project's
 * "Redirect URLs" allowlist; otherwise it silently falls back to the project's Site URL.
 * That drops confirmation and password-reset links on the marketing page, where nothing
 * reads them and the founder sees a landing page that appears to have ignored their
 * click. Forwarding the link to the one route that can consume it keeps those links
 * working while the allowlist is incomplete.
 */
/** Supabase's PKCE codes are UUIDs. `?code=` is also an ordinary marketing parameter, and
 * forwarding one of those would bounce a visitor off the landing page to a login error,
 * so only a code shaped like Supabase's is treated as an auth link. */
const SUPABASE_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authCallbackQuery(params: AuthLinkParams): string | null {
  const forwarded = new URLSearchParams();

  if (params.code && SUPABASE_CODE.test(params.code)) {
    forwarded.set("code", params.code);
  } else if (params.token_hash && params.type) {
    forwarded.set("token_hash", params.token_hash);
    forwarded.set("type", params.type);
  } else if (params.error || params.error_description) {
    // Nothing to consume, but the reason still belongs in front of the founder rather
    // than behind a landing page that looks like it did nothing.
    if (params.error) forwarded.set("error", params.error);
    if (params.error_description) forwarded.set("error_description", params.error_description);
  } else {
    return null;
  }

  // `type` rides along even on the error path: it is what tells the callback whether a
  // dead link belongs back at forgot-password or at login.
  if (params.type && !forwarded.has("type")) forwarded.set("type", params.type);
  if (params.next) forwarded.set("next", params.next);

  return forwarded.toString();
}
