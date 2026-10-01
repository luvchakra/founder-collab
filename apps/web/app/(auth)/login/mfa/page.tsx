import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { needsMfaStepUp } from "@cofounderai/core/security/mfa";
import { signOut } from "@/app/(auth)/actions";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";

export default async function MfaChallengePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await needsMfaStepUp(supabase))) redirect("/dashboard");

  return (
    <div className="w-full max-w-sm rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
      <h1 className="text-2xl font-semibold text-landing-fg">Two-factor verification</h1>
      <p className="mt-2 text-sm text-landing-muted">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        <MfaChallengeForm />
        <form action={signOut}>
          <button type="submit" className="text-xs text-landing-muted underline underline-offset-4">
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}
