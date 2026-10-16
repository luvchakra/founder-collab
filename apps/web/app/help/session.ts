import { redirect } from "next/navigation";
import { createClient } from "@cofounderai/core/db/server";
import { signInUrlFor } from "@cofounderai/core/help/access";

/**
 * Help is for signed-in users only. The proxy already sends a signed-out visitor to sign-in
 * (core/db/middleware.ts); every help page checks again here, on the server, the same way
 * the dashboard layout does, so the content never renders without a session. Reading the
 * session also makes each page render per request: nothing is prerendered or cached
 * publicly.
 */
export async function requireHelpSession(pathname: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(signInUrlFor(pathname));
}

/** True when the request carries a signed-in session. */
export async function hasHelpSession(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}
