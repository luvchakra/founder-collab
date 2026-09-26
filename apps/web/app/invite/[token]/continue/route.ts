import { NextResponse, type NextRequest } from "next/server";

/**
 * RBAC-27 -- a signed-out invitee on their way to sign in or sign up. The token is kept in
 * a short-lived httpOnly cookie (never in a URL the auth pages would log or forward) and
 * /dashboard and /onboarding send the user back to /invite/<token> once they're in.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = request.nextUrl.searchParams.get("to");
  // "dashboard": the invitation can't be used -- forget it, so /dashboard stops sending
  // the user back here.
  if (target === "dashboard") {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.delete("wa_pending_invite");
    return response;
  }
  const to = target === "signup" ? "/signup" : "/login";
  const response = NextResponse.redirect(new URL(to, request.url));
  if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    response.cookies.set("wa_pending_invite", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }
  return response;
}
