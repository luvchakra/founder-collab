import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

/** Also where /auth/callback sends a recovery link it could not consume (expired, already
 * used, or opened in another browser), since requesting a fresh one is the way out. */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Reset your password</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      {error ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
