"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@cofounderai/core/ui/input";
import { PasswordInput } from "@cofounderai/core/ui/password-input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { signInWithOAuthProvider, type AuthActionState } from "@/app/(auth)/actions";
import { OAUTH_PROVIDERS, OAUTH_PROVIDER_LABELS, type OAuthProvider } from "@cofounderai/core/auth/oauth-providers";

export function AuthForm({
  mode,
  action,
  providers,
}: {
  mode: "login" | "signup";
  action: (
    prevState: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  /** Which sign-in providers this deployment's Supabase project actually has turned on.
   * A button that cannot work is worse than no button -- see core/auth/oauth-providers.ts. */
  providers: Record<OAuthProvider, boolean>;
}) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    action,
    null,
  );

  const isLogin = mode === "login";
  const enabledProviders = OAUTH_PROVIDERS.filter((provider) => providers[provider]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        {!isLogin ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" autoComplete="name" />
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {isLogin ? (
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-4"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={isLogin ? undefined : 8}
            required
          />
        </div>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <SubmitButton pendingText="Please wait…">
          {isLogin ? "Log In" : "Create Account"}
        </SubmitButton>
      </form>

      {enabledProviders.length > 0 ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col gap-2">
            {enabledProviders.map((provider) => (
              <form key={provider} action={signInWithOAuthProvider.bind(null, provider)}>
                <SubmitButton variant="outline" className="w-full" pendingText="Redirecting…">
                  <ProviderMark provider={provider} />
                  Continue with {OAUTH_PROVIDER_LABELS[provider]}
                </SubmitButton>
              </form>
            ))}
          </div>
        </>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        {isLogin ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Create your account →
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Log in →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

function ProviderMark({ provider }: { provider: OAuthProvider }) {
  if (provider === "azure") return <MicrosoftMark />;
  if (provider === "linkedin_oidc") return <LinkedInMark />;
  return <GoogleMark />;
}

/** Microsoft's four-square logo, as its sign-in branding guidance asks for. */
function MicrosoftMark() {
  return (
    <svg className="size-4" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}

/** LinkedIn's "in" mark. */
function LinkedInMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"
      />
    </svg>
  );
}

/**
 * Google's own four-colour G. Inline rather than an icon-font glyph: lucide has no brand
 * marks, and Google's sign-in branding guidance asks for this exact logo on the button.
 */
function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.2 13.2 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}
