export default function ForgotPasswordCheckEmailPage() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8 text-center">
      <h1 className="text-2xl font-semibold text-landing-fg">Check your email</h1>
      <p className="mt-3 text-sm text-landing-muted">
        If an account exists for that email, we&apos;ve sent a link to reset your
        password.
      </p>
    </div>
  );
}
