import { redirect } from "next/navigation";

/**
 * "/dashboard" under a business slug is a natural thing to type/expect (every module has
 * its own "<module>/dashboard"), but there is no business-scoped Executive Dashboard --
 * the Executive Dashboard is account-wide, at the bare /dashboard route. Redirecting here
 * rather than 404ing sends a founder who lands on this URL to the real thing instead of a
 * dead end.
 */
export default function BusinessDashboardRedirectPage() {
  redirect("/dashboard");
}
