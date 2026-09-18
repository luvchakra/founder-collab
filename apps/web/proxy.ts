import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@cofounderai/core/db/middleware";
import { authCallbackQuery } from "./lib/auth-link";

// Thin wrapper -- `updateSession()` (packages/core/src/db/middleware.ts) does the real
// work: session refresh, auth route boundary, AND the per-module license route guard
// (rewrites an unlicensed module's route to /not-licensed with module/reason/
// graceEndsAt params, CLAUDE.md's "route guard in proxy.ts" enforcement layer). This
// comment used to describe that gating as future work ("lands in Epic 2's C-5, once
// core's tenancy/licensing tables exist") -- stale, since it's already live inside
// updateSession(); corrected this pass (docs/testing/test-cases/menu-smoke.md's
// TC-MENU-LIC-002 finding, which read this file's own body and found no license logic
// in it, missed that the guard lives one level down in the shared middleware helper).
export async function proxy(request: NextRequest) {
  // Where Supabase drops an auth link whose redirect wasn't on the project's allowlist:
  // the site root, which reads none of it (lib/auth-link.ts). Forwarded from here rather
  // than from the page so "/" itself stays a static page with nothing to read at request
  // time -- and because the link is the whole reason this visitor is here, it goes
  // before the session work below.
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/") {
    const forwarded = authCallbackQuery(Object.fromEntries(searchParams));
    if (forwarded) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback";
      url.search = `?${forwarded}`;
      return NextResponse.redirect(url);
    }
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimization files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
