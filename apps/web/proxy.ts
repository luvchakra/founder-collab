import { type NextRequest } from "next/server";
import { updateSession } from "@cofounderai/core/db/middleware";

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
