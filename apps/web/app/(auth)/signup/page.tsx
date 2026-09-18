import { getPublicLoginBranding } from "@cofounderai/core/admin/platform-branding";
import { getEnabledOAuthProviders } from "@cofounderai/core/auth/oauth-providers";
import { AuthForm } from "@/components/auth/auth-form";
import { signup } from "@/app/(auth)/actions";

export default async function SignupPage() {
  const [branding, providers] = await Promise.all([
    getPublicLoginBranding(),
    getEnabledOAuthProviders(),
  ]);
  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Let&apos;s find your first customers.</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Create your {branding.platformName} account and start building your customer pipeline.
      </p>
      <div className="mt-8">
        <AuthForm mode="signup" action={signup} googleEnabled={providers.google} />
      </div>
    </div>
  );
}
