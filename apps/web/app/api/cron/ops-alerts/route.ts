import { NextResponse } from "next/server";
import { runOpsAlertCheck } from "@cofounderai/core/admin/platform-ops-alerts";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * PLATFORM-P1-07.4 ("Operational Alerts"): checks platform health and emails platform
 * operators about each newly opened alert (packages/core/src/admin/platform-ops-alerts.ts).
 * Scheduled in vercel.json after the 06:00 UTC jobs, so it sees what they left behind.
 * Authenticated like every other cron route: `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runOpsAlertCheck();
  return NextResponse.json(result);
}
