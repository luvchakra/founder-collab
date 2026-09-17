import { type NextRequest } from "next/server";
import { updateSession } from "@cofounderai/core/db/middleware";

// Session refresh, the auth route boundary, and licensing enforcement layer 2 -- the
// route guard that 404s an unlicensed module's routes rather than advertising them
// (00-MASTER-PLAN.md). All of it lives in updateSession; this file is only the Next
// entry point and the matcher that decides which paths reach it.
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
