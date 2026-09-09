import { NextResponse } from "next/server";
import { expireGracePeriods } from "@cofounderai/core/licensing/lifecycle";

/**
 * ADR-9's second phase: flips every `grace` license past its `grace_ends_at` to
 * `expired` (read access denied from then on; rows are never deleted). Previously
 * unwired entirely -- `expireGracePeriods()` existed and was correct in isolation, but
 * nothing ever called it, so a cancelled license's 30-day grace period never actually
 * expired on its own (docs/testing/EXECUTION-2026-09-08.md finding 1). Same shared-secret
 * auth as `api/cron/drain-events`/`send-reminders`, since the caller is a scheduler, not
 * a logged-in user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredCount = await expireGracePeriods();
  return NextResponse.json({ expiredCount });
}
