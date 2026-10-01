"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@cofounderai/core/db/server";
import { validatePassword } from "@cofounderai/core/security/password-policy";
import { MFA_CHALLENGE_PATH, needsMfaStepUp } from "@cofounderai/core/security/mfa";
import { recordSignupConsents } from "@cofounderai/core/privacy/consent";

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

  if (await needsMfaStepUp(supabase)) {
    redirect(MFA_CHALLENGE_PATH);
  }
  redirect("/dashboard");
}

/** Completes the TOTP step-up for a session that signed in with a password but has a
 * verified MFA factor (security/mfa.ts). Supabase rate-limits verify attempts itself. */
export async function verifyMfaChallenge(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your authenticator app." };
  }

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: listError.message };
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/dashboard");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    return { error: "That code didn't match. Check your authenticator app and try again." };
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
  const passwordError = validatePassword(password, { email });
  if (passwordError) {
    return { error: passwordError };
  }
  // Consent must be an affirmative act (GDPR Art. 4(11)/7; DPDP s.6(1)) -- enforced here,
  // not just by the checkbox's `required`, which a crafted request can omit.
  if (formData.get("acceptPrivacy") !== "on") {
    return { error: "Please confirm you've read the privacy notice and are 18 or older." };
  }
  const marketingConsent = formData.get("marketingConsent") === "on";

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

  // Record what was agreed to against the id Supabase just created. An address that's
  // already registered comes back as an obfuscated user with no identities (Supabase
  // hides account existence) -- there's no real user row to attach consent to then.
  if (data.user && (data.user.identities?.length ?? 0) > 0) {
    await recordSignupConsents(data.user.id, marketingConsent);
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
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const passwordError = validatePassword(password, { email: user?.email });
  if (passwordError) {
    return { error: passwordError };
  }
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
