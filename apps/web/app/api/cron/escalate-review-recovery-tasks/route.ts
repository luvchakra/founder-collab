import { NextResponse } from "next/server";
import { escalateOverdueNegativeReviewFollowUps } from "@cofounderai/module-crm/lib/reviews/recovery-rules";

/**
 * CRM-08.7's third rule, "unresolved negative review -> escalation": sweeps every
 * business's overdue, still-unresolved negative-review recovery tasks and bumps their
 * priority. Same shared-secret auth as `api/cron/check-whatsapp-health`/`drain-events`/
 * `send-reminders`/`expire-licenses`, since the caller is a scheduler, not a logged-in
 * user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await escalateOverdueNegativeReviewFollowUps();
  return NextResponse.json(result);
}
