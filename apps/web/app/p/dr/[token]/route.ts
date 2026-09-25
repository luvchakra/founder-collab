import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@cofounderai/core/db/admin";
import { resolveShareAccess } from "@cofounderai/module-discovery/lib/funding/share-access";

/**
 * FND-12 — a data-room share link, opened by an investor who has no account. The whole
 * authorisation is the link (see resolveShareAccess): a valid, unexpired, unrevoked token
 * redirects to a one-minute signed URL for that single document; anything else gets a
 * plain page that reveals nothing about the business or the document.
 */
export const dynamic = "force-dynamic";

const MESSAGES = {
  malformed: "This link is not valid.",
  not_found: "This link is not valid.",
  revoked: "This link has been withdrawn by the sender.",
  expired: "This link has expired. Ask the sender for a new one.",
  item_unavailable: "This document is no longer available.",
} as const;

function page(message: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Shared document</title></head><body style="font-family:system-ui,sans-serif;background:#f5f7fb;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px"><p style="background:#fff;border:1px solid #e3e8f0;border-radius:12px;padding:24px;max-width:420px">${message}</p></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex" },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const result = await resolveShareAccess(
      token,
      { discovery: createAdminClient({ schema: "discovery" }), core: createAdminClient({ schema: "core" }) },
      { userAgent: request.headers.get("user-agent") },
    );
    if (!result.ok) return page(MESSAGES[result.reason], result.reason === "revoked" || result.reason === "expired" ? 410 : 404);
    const response = NextResponse.redirect(result.url, 302);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch {
    return page("Something went wrong opening this document. Try again in a moment.", 500);
  }
}
