import { cache } from "react";

/**
 * Which third-party sign-in providers this deployment's Supabase project actually has
 * turned on.
 *
 * A "Continue with Google" button on a project where Google is disabled is worse than no
 * button at all: it looks like the supported way in, and clicking it comes back with
 * Supabase's own "Unsupported provider: provider is not enabled", which reads as a fault
 * in the app rather than an unfinished setup step. Asking the project itself means the
 * button appears the moment an operator enables Google in the Supabase dashboard -- no
 * redeploy, no env var to remember to flip in a second place.
 *
 * `/auth/v1/settings` is a public, unauthenticated endpoint (it only needs the
 * publishable key, the same key the browser already carries) whose whole purpose is
 * telling a client what the project supports. It answers in a few milliseconds and is
 * cached for five minutes, so the login page -- the first thing every returning founder
 * loads -- does not pay for this on every request.
 */

export type OAuthProvider = "google";

type AuthSettings = { external?: Record<string, boolean> };

const SETTINGS_CACHE_SECONDS = 300;

/**
 * Fails open: if the project can't be reached or answers with something unexpected, the
 * providers are reported as enabled rather than hidden. A transient blip must never take
 * away a working way to sign in -- and the sign-in action's own error path already
 * explains an unenabled provider in plain words if the guess turns out wrong.
 */
export const getEnabledOAuthProviders = cache(async (): Promise<Record<OAuthProvider, boolean>> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return { google: true };

  try {
    // `next.revalidate` is Next's own extension to RequestInit. This package declares
    // next as a peer dependency rather than pulling in its global type augmentation, so
    // the option is spelled out in a local type instead of being cast away.
    const init: RequestInit & { next?: { revalidate?: number } } = {
      headers: { apikey: key },
      next: { revalidate: SETTINGS_CACHE_SECONDS },
    };
    const response = await fetch(`${url}/auth/v1/settings`, init);
    if (!response.ok) return { google: true };
    const settings = (await response.json()) as AuthSettings;
    // An `external` map that came back without the key at all is a shape we don't
    // recognise, so fall open the same way an unreachable project does.
    const google = settings.external?.google;
    return { google: typeof google === "boolean" ? google : true };
  } catch (cause) {
    console.warn("[auth] Could not read the Supabase project's enabled providers.", cause);
    return { google: true };
  }
});

/**
 * Turns whatever Supabase said about a failed OAuth start into something a person can
 * act on. "Unsupported provider: provider is not enabled" is accurate and useless: it
 * describes the project's configuration in the vocabulary of the API, to someone who is
 * just trying to log in.
 */
export function readableOAuthError(message: string, provider: OAuthProvider): string {
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    const name = provider.charAt(0).toUpperCase() + provider.slice(1);
    return `${name} sign-in isn't switched on for this deployment yet. Use your email and password, or ask an administrator to enable ${name} in Supabase → Authentication → Providers.`;
  }
  return message;
}
