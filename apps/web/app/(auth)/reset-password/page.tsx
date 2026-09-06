import Link from "next/link";
import { createClient } from "@cofounderai/core/db/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Set a new password</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Choose a new password for your account.
      </p>
      <div className="mt-8">
        {user ? (
          <ResetPasswordForm />
        ) : (
          <p className="text-sm text-landing-muted">
            This reset link is invalid or has expired. Request a new one from{" "}
            <Link href="/forgot-password" className="underline underline-offset-4">
              forgot password
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
