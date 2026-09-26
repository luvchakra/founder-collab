import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@cofounderai/core/db/server";
import { previewInvitation } from "@cofounderai/core/rbac/members";
import { Button } from "@cofounderai/core/ui/button";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { AcceptInvitationButton } from "./accept-button";

/**
 * RBAC-08 / RBAC-27 -- where an invitation link lands (§17, §19). Public route (the
 * invitee may not have an account yet); nothing about the business is shown until the
 * signed-in user is the one the invitation was addressed to -- core.get_invitation()
 * decides that, not this page. Signed out, the token rides in a short-lived httpOnly
 * cookie through sign-in or sign-up (./continue) and the dashboard/onboarding bring the
 * user back here.
 */
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
      <MailCheck className="size-12 text-primary" aria-hidden="true" />
      {children}
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">You&apos;ve been invited</h1>
        <p className="text-muted-foreground">
          Sign in to {BRAND_NAME} to see and accept your invitation — or create an account with the email address it was sent to.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button asChild>
            <Link href={`/invite/${token}/continue?to=login`}>Sign in to accept</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/invite/${token}/continue?to=signup`}>Create an account</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const invitation = await previewInvitation(token);
  if (invitation.status === "wrong_account") {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">This invitation is for another account</h1>
        <p className="text-muted-foreground">
          It was sent to <span className="font-medium text-foreground">{invitation.email}</span>, but you&apos;re signed in as{" "}
          <span className="font-medium text-foreground">{user.email}</span>. Sign out and sign in with the invited email to accept it.
        </p>
        <Button asChild variant="outline">
          <Link href={`/invite/${token}/continue?to=dashboard`}>Go to your dashboard</Link>
        </Button>
      </Shell>
    );
  }
  if (invitation.status !== "pending") {
    const message =
      invitation.status === "accepted"
        ? "This invitation has already been accepted."
        : invitation.status === "expired"
          ? "This invitation has expired. Ask the person who invited you to send a new one."
          : invitation.status === "revoked"
            ? "This invitation was withdrawn."
            : "This invitation link isn't valid.";
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Invitation unavailable</h1>
        <p className="text-muted-foreground">{message}</p>
        <Button asChild variant="outline">
          <Link href={`/invite/${token}/continue?to=dashboard`}>Go to your dashboard</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Join {invitation.businessName}</h1>
      <p className="text-muted-foreground">
        {invitation.invitedByName} invited you to <span className="font-medium text-foreground">{invitation.businessName}</span>.
      </p>
      <dl className="w-full rounded-xl border bg-card p-4 text-left text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="font-medium">{invitation.roleName}</dd>
        </div>
        <div className="mt-2 flex justify-between gap-3">
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{invitation.expiresAt ? new Date(invitation.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}</dd>
        </div>
      </dl>
      <AcceptInvitationButton token={token} />
    </Shell>
  );
}
