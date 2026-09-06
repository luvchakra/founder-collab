import { type NextRequest } from "next/server";
import { updateSession } from "@cofounderai/core/db/middleware";

// Session refresh + auth route boundary only (co-founder-ai's own proxy.ts, ported
// unchanged) -- business-switcher resolution and per-module license gating land in
// Epic 2's C-5, once core's tenancy/licensing tables exist.
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
