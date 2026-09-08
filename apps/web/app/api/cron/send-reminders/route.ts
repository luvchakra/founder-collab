import { NextResponse } from "next/server";
import { sendDueReminders } from "@cofounderai/module-fsm/lib/reminders/mutations";

/**
 * Sends both internal (kind='reminder') and customer-facing (kind='work'/'estimate')
 * reminders that have crossed their business's `reminder_lead_hours` window (F-9, PRD
 * §1.5). Point a Vercel Cron job (or any scheduler) at this route -- same shared-secret
 * auth as `api/cron/drain-events`, since the caller is a scheduler, not a logged-in user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendDueReminders();
  return NextResponse.json(result);
}
