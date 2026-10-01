import { NextResponse } from "next/server";
import { escalateOverdueNegativeReviewFollowUps } from "@cofounderai/module-crm/lib/reviews/recovery-rules";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * CRM-08.7's third rule, "unresolved negative review -> escalation": sweeps every
 * business's overdue, still-unresolved negative-review recovery tasks and bumps their
 * priority. Same shared-secret auth as `api/cron/check-whatsapp-health`/`drain-events`/
 * `send-reminders`/`expire-licenses`, since the caller is a scheduler, not a logged-in
 * user.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await escalateOverdueNegativeReviewFollowUps();
  return NextResponse.json(result);
}
