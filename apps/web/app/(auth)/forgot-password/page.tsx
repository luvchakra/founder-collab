import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Reset your password</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>
      <div className="mt-8">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
