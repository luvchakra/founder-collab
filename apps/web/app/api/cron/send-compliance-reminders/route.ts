import { NextResponse } from "next/server";
import { sendDueComplianceReminders } from "@cofounderai/module-gst/lib/reminders/mutations";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * COMPLY-P0-09.3 (Reminder Engine): sends GSTR-1/3B/9 filing reminders that have crossed
 * their 7-day/1-day lead-time thresholds. Same shared-secret auth as every other cron
 * route in this platform (`api/cron/send-reminders`, `api/cron/drain-events`) -- the
 * caller is a scheduler, not a logged-in user.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueComplianceReminders();
  return NextResponse.json(result);
}
