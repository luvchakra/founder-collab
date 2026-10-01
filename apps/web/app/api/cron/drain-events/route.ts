import { NextResponse } from "next/server";
import { drainDomainEvents } from "@cofounderai/core/events/drain";
import { bearerTokenMatches } from "@cofounderai/core/security/timing-safe";
import { registerDiscoveryEventHandlers } from "@cofounderai/module-discovery/events/handlers";

registerDiscoveryEventHandlers();

/**
 * Drains due core.domain_events (D-9) -- point a Vercel Cron job (or any scheduler) at
 * this route. Authenticated the same way as the other webhook routes here (a shared
 * secret header), since the caller is a scheduler, not a logged-in user -- Vercel Cron's
 * own convention is `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainDomainEvents();
  return NextResponse.json(result);
}
