"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@cofounderai/core/db/server";
import {
  OAUTH_PROVIDER_LABELS,
  isOAuthProvider,
  readableOAuthError,
  type OAuthProvider,
} from "@cofounderai/core/auth/oauth-providers";

export type AuthActionState = { error: string } | null;

function getCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const { email, password } = getCredentials(formData);
  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signup(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const { email, password } = getCredentials(formData);
  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // Supabase's confirmation link redirects to the project's dashboard-configured Site
  // URL unless we tell it otherwise -- without this, that link always points wherever
  // Site URL happens to be set (e.g. localhost) regardless of where the founder actually
  // signed up from. Reading the request's own origin means this works correctly in both
  // local dev and production without hardcoding either.
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
      data: name ? { full_name: name } : undefined,
    },
  });
  if (error) {
    return { error: error.message };
  }

  // If email confirmation is required, Supabase returns a user but no session.
  if (!data.session) {
    redirect("/signup/check-email");
  }

  // A new account lands on the dashboard, whose empty state points to the business
  // switcher for creating the first business -- there is no separate onboarding wizard.
  redirect("/dashboard");
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "Email is required." };
  }

  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Supabase intentionally doesn't say whether the email is registered (avoids leaking
  // which emails have an account) -- an error here means the *request itself* failed
  // (rate limit, malformed email), not "no account found", so it's safe to surface.
  if (error) {
    return { error: error.message };
  }

  redirect("/forgot-password/check-email");
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message };
  }

  // A reset is often the response to someone else having had the password, so end every
  // other session rather than leaving them signed in with the old one. Best-effort: the
  // password is already changed, and failing the whole action here would tell the founder
  // the reset did not work when it did.
  await supabase.auth.signOut({ scope: "others" });

  redirect("/dashboard");
}

/** Optional OAuth (landing-page-requirements.md's auth sections): Google, Microsoft
 * (`azure`) and LinkedIn (`linkedin_oidc`). Each works once enabled as a provider in the
 * Supabase project's Auth settings; until then the button is hidden
 * (core/auth/oauth-providers.ts) and Supabase itself returns a clean "provider not
 * enabled" error rather than this failing silently.
 *
 * A server action's arguments arrive from the client, so the provider is checked against
 * the allowlist, and the post-auth destination is always the dashboard -- nothing the
 * client sends can steer the redirect. */
export async function signInWithOAuthProvider(provider: OAuthProvider) {
  if (!isOAuthProvider(provider)) redirect(`/login?error=${encodeURIComponent("That sign-in method isn't available.")}`);
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      // Microsoft only returns the address when asked for the `email` scope; without it
      // Supabase can't create the user (Supabase's Azure guide).
      ...(provider === "azure" ? { scopes: "email" } : {}),
    },
  });
  if (error || !data.url) {
    // The most common failure here is that nobody has switched the provider on in the
    // Supabase dashboard yet, and Supabase says so in its own API vocabulary --
    // readableOAuthError turns that into an instruction. The button is normally hidden in
    // that case, so this is the path for a provider disabled between the page render and
    // the click, or a probe that failed open.
    const reason = error?.message
      ? readableOAuthError(error.message, provider)
      : `${OAUTH_PROVIDER_LABELS[provider]} sign-in is not available yet.`;
    redirect(`/login?error=${encodeURIComponent(reason)}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
