import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";
import { safeRedirectPath } from "@cofounderai/core/security/safe-redirect";

// Handles the redirect from Supabase Auth email links (signup confirmation, magic link)
// by exchanging the one-time code for a session cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` comes straight from the query string -- only a same-origin path is honoured,
  // otherwise this is an open redirect (e.g. next=@evil.com -> https://app@evil.com).
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
