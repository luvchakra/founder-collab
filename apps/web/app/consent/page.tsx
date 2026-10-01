import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { hasAcceptedCurrentNotice } from "@cofounderai/core/privacy/consent";
import { safeRedirectPath } from "@cofounderai/core/security/safe-redirect";
import { signOut } from "@/app/(auth)/actions";
import { ConsentForm } from "@/components/auth/consent-form";

/**
 * Shown before any processing when a user hasn't accepted the current privacy notice:
 * accounts created through Google sign-in (which skips the signup form's checkbox), and
 * every user once PRIVACY_NOTICE_VERSION changes. The dashboard layout and onboarding
 * redirect here.
 */
export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const next = safeRedirectPath((await searchParams).next, "/dashboard");
  if (await hasAcceptedCurrentNotice(user.id)) redirect(next);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Before you continue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please review our{" "}
          <Link href="/privacy" target="_blank" className="text-primary underline">
            privacy notice
          </Link>
          . It explains what we collect, why, who we share it with, how long we keep it, and your rights.
        </p>
      </div>
      <ConsentForm next={next} />
      <form action={signOut}>
        <button type="submit" className="text-xs text-muted-foreground underline underline-offset-4">
          Sign out instead
        </button>
      </form>
    </main>
  );
}
