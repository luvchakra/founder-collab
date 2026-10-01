import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { MfaEnrollment } from "@/components/settings/mfa-enrollment";
import { removeMfaFactorAction } from "./actions";

export default async function SecuritySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Security</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protect your account with two-factor authentication. Once enabled, every sign-in
          asks for a code from your authenticator app before any business data is shown.
        </p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Two-factor authentication</h2>
          {verified.length > 0 ? <Badge>On</Badge> : <Badge variant="outline">Off</Badge>}
        </div>

        {verified.map((factor) => (
          <div key={factor.id} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {factor.friendly_name ?? "Authenticator app"}{" "}
              <span className="text-muted-foreground">
                · added {new Date(factor.created_at).toLocaleDateString()}
              </span>
            </span>
            <form action={removeMfaFactorAction.bind(null, factor.id)}>
              <SubmitButton variant="outline" size="sm" pendingText="Removing...">
                Remove
              </SubmitButton>
            </form>
          </div>
        ))}

        {verified.length === 0 ? <MfaEnrollment /> : null}
      </section>
    </main>
  );
}
