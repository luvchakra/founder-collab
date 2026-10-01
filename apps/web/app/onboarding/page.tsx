import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { hasAcceptedCurrentNotice } from "@cofounderai/core/privacy/consent";
import { getCurrentAccount } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { OnboardingWizard } from "@cofounderai/module-discovery/components/onboarding/wizard";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasAcceptedCurrentNotice(user.id))) redirect("/consent?next=/onboarding");

  const account = await getCurrentAccount();
  if (!account) redirect("/dashboard");

  return (
    <div className="landing-theme dark flex min-h-full flex-1 flex-col items-center justify-center bg-landing-bg px-6 py-16 text-landing-fg">
      <div className="landing-grid pointer-events-none fixed inset-0" />
      <OnboardingWizard accountId={account.id} />
    </div>
  );
}
