"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@cofounderai/core/ui/input";
import { PasswordInput } from "@cofounderai/core/ui/password-input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { signInWithGoogle, type AuthActionState } from "@/app/(auth)/actions";

export function AuthForm({
  mode,
  action,
  googleEnabled,
}: {
  mode: "login" | "signup";
  action: (
    prevState: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  /** Whether this deployment's Supabase project actually has Google turned on. A button
   * that cannot work is worse than no button -- see core/auth/oauth-providers.ts. */
  googleEnabled: boolean;
}) {
  const [state, formAction] = useActionState<AuthActionState, FormData>(
    action,
    null,
  );

  const isLogin = mode === "login";

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

      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            OR
            <span className="h-px flex-1 bg-border" />
          </div>

          <form action={signInWithGoogle.bind(null, isLogin ? "/dashboard" : "/onboarding")}>
            <SubmitButton variant="outline" className="w-full" pendingText="Redirecting…">
              <GoogleMark />
              Continue with Google
            </SubmitButton>
          </form>
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
