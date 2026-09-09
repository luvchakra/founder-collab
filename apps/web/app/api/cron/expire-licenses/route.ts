import { NextResponse } from "next/server";
import { expireGracePeriods, processDueCancellations } from "@cofounderai/core/licensing/lifecycle";

/**
 * The daily license-lifecycle sweep, both halves of it: first moves every license whose
 * scheduled cancellation date has arrived from active into its grace period
 * (processDueCancellations()), then flips every `grace` license past its
 * `grace_ends_at` to `expired` (expireGracePeriods()) -- read access denied from then on,
 * rows never deleted (ADR-9). Order matters: a cancellation due today should get its own
 * fresh 30-day grace window counted from today, not be swept into `expired` in the same
 * run. Previously this route only ran expireGracePeriods() -- extended here rather than
 * adding a second cron route, since both are the same "process today's license
 * transitions" job on the same schedule (docs/testing/EXECUTION-2026-09-08.md finding 1
 * originally wired the first half in). Same shared-secret auth as
 * `api/cron/drain-events`/`send-reminders`, since the caller is a scheduler, not a
 * logged-in user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cancelledCount = await processDueCancellations();
  const expiredCount = await expireGracePeriods();
  return NextResponse.json({ cancelledCount, expiredCount });
}
