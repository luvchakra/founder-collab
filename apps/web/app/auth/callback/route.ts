import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@cofounderai/core/db/server";

/**
 * Landing point for every Supabase Auth email link — signup confirmation, magic link and
 * password recovery — plus the OAuth redirect. It turns whatever the link carries into a
 * session cookie, then forwards to `next`.
 *
 * Supabase sends one of three shapes, and which one depends on the project's email
 * template, so all three are handled here rather than assuming a single configuration:
 *
 * - `?token_hash=…&type=recovery` — consumed with verifyOtp(). This is the shape to
 *   prefer: it carries everything needed in the URL, so a link requested on a laptop
 *   still works when the email is opened on a phone. It requires the Supabase project's
 *   "Reset password" template to link to
 *   `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
 *   instead of the default `{{ .ConfirmationURL }}`.
 * - `?code=…` — PKCE, what `{{ .ConfirmationURL }}` produces for a request that began in
 *   this app. The code verifier lives in a cookie on the browser that asked for the
 *   reset, so this shape only works if the link is opened in that same browser.
 * - `?error=…&error_description=…` — Supabase itself rejected the link (expired, or
 *   already used).
 *
 * A link that cannot be consumed must say why. Silently landing on /login looks to a
 * founder like the reset "did nothing", and they retry the same dead link.
 */

/** Fixed internal destinations: `next` is attacker-controllable, so it never decides
 * where a *failed* link goes. */
const RECOVERY_FALLBACK = "/forgot-password";
const DEFAULT_FALLBACK = "/login";

/** Supabase's own wording for a PKCE link opened somewhere other than where it was
 * requested is about the code verifier, which means nothing to a founder. */
function readableReason(message: string): string {
  if (/code verifier/i.test(message)) {
    return "That link was opened in a different browser or device than the one that asked for it. Request a new link and open it here.";
  }
  return message;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  const isRecovery = type === "recovery" || next === "/reset-password";
  const fail = (reason: string) =>
    NextResponse.redirect(
      `${origin}${isRecovery ? RECOVERY_FALLBACK : DEFAULT_FALLBACK}?error=${encodeURIComponent(
        readableReason(reason),
      )}`,
    );

  if (providerError) return fail(providerError);

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.message);
    return NextResponse.redirect(`${origin}${next}`);
  }

  return fail("That link is missing its confirmation code. Request a new one.");
}
