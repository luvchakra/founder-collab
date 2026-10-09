import { redirect } from "next/navigation";

/**
 * The post-signup onboarding wizard has been retired: new accounts go straight to the
 * dashboard, whose empty state points to the business switcher for creating the first
 * business. This route stays as a redirect so confirmation emails already sent with
 * `next=/onboarding` still land somewhere useful. The dashboard itself forwards an
 * invitee to their pending invitation (RBAC-27).
 */
export default function OnboardingPage() {
  redirect("/dashboard");
}
