import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthError } from "@/components/auth/auth-error";
import { login } from "@/app/(auth)/actions";
import { getPublicLoginBranding } from "@cofounderai/core/admin/platform-branding";
import { getEnabledOAuthProviders } from "@cofounderai/core/auth/oauth-providers";

/**
 * PLATFORM-P0-03.3: `login_headline`/`login_support_text` (added by PLATFORM-P0-03.1)
 * override this page's default copy when a superadmin has set them; both default to
 * `null`, so an unconfigured platform shows exactly the same "Welcome back, Founder." /
 * "Your next customer is waiting." copy it always has. The terms/privacy legal links
 * render only when at least one is configured -- nothing appears on an unconfigured
 * platform.
 */
export default async function LoginPage() {
  const [branding, providers] = await Promise.all([
    getPublicLoginBranding(),
    getEnabledOAuthProviders(),
  ]);
  const hasLegalLinks = Boolean(branding.loginTermsUrl || branding.loginPrivacyUrl);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">{branding.loginHeadline || "Welcome back, Founder."}</h1>
      <p className="mt-2 text-sm text-landing-muted">
        {branding.loginSupportText || "Your next customer is waiting."}
      </p>
      <Suspense fallback={null}>
        <AuthError />
      </Suspense>
      <div className="mt-8">
        <AuthForm mode="login" action={login} googleEnabled={providers.google} />
      </div>
      {hasLegalLinks ? (
        <p className="mt-6 text-center text-xs text-landing-muted">
          {branding.loginTermsUrl ? (
            <a href={branding.loginTermsUrl} className="underline hover:text-landing-fg">
              Terms
            </a>
          ) : null}
          {branding.loginTermsUrl && branding.loginPrivacyUrl ? " · " : null}
          {branding.loginPrivacyUrl ? (
            <a href={branding.loginPrivacyUrl} className="underline hover:text-landing-fg">
              Privacy
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
