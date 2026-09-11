import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";

/**
 * PLATFORM-P0-18.1: MFA required for SUPERADMIN. This is a second, independent
 * authorization layer stacked on top of `platform/layout.tsx`'s own `requireSuperadmin()`
 * identity check (which stays exactly as it was -- see that file) -- it does not replace
 * it. Every page nested under this `(protected)` route group additionally requires the
 * session to have already stepped up to AAL2 (a verified TOTP factor challenged this
 * session), checked via the Supabase JS SDK's own `auth.mfa.getAuthenticatorAssuranceLevel()`
 * -- this is the first MFA feature anywhere in this codebase, so there is no prior
 * scaffolding beyond that SDK method itself.
 *
 * `/platform/mfa` (the enroll/verify flow) deliberately sits OUTSIDE this route group, as
 * a sibling under `/platform/`, so it is reachable at AAL1 -- nesting it in here would
 * make a not-yet-verified superadmin bounce straight back to itself, looping forever.
 */
export default async function PlatformProtectedLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error || data?.currentLevel !== "aal2") {
    redirect("/platform/mfa");
  }

  return <>{children}</>;
}
