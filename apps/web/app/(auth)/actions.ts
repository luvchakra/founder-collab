"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@cofounderai/core/db/server";

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
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
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

  redirect("/onboarding");
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

  redirect("/dashboard");
}

/** Optional OAuth (landing-page-requirements.md's auth sections) -- works once Google is
 * enabled as a provider in the Supabase project's Auth settings; until then Supabase
 * itself returns a clean "provider not enabled" error rather than this failing silently. */
export async function signInWithGoogle(next: "/dashboard" | "/onboarding" = "/dashboard") {
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${next}` },
  });
  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in is not available yet.")}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
