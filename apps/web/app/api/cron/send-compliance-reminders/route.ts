import { NextResponse } from "next/server";
import { sendDueComplianceReminders } from "@cofounderai/module-gst/lib/reminders/mutations";

/**
 * COMPLY-P0-09.3 (Reminder Engine): sends GSTR-1/3B/9 filing reminders that have crossed
 * their 7-day/1-day lead-time thresholds. Same shared-secret auth as every other cron
 * route in this platform (`api/cron/send-reminders`, `api/cron/drain-events`) -- the
 * caller is a scheduler, not a logged-in user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueComplianceReminders();
  return NextResponse.json(result);
}
