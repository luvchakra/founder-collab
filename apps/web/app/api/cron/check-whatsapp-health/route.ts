import { NextResponse } from "next/server";
import { checkAllWhatsAppConnectionsHealth } from "@cofounderai/module-crm/lib/whatsapp/health";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * CRM-15.5's periodic reliability check: re-verifies every non-disconnected WhatsApp
 * connection across every business against the real Graph API, catching a token that
 * expired or was revoked with no send/receive traffic around to surface it inline
 * (`sendWhatsAppReply()`/`sendWhatsAppTemplate()` already do that half themselves). Same
 * shared-secret auth as `api/cron/drain-events`/`send-reminders`/`expire-licenses`, since
 * the caller is a scheduler, not a logged-in user.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAllWhatsAppConnectionsHealth();
  return NextResponse.json(result);
}
