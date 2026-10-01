import { NextResponse } from "next/server";
import { expireExportJobs } from "@cofounderai/core/exports/jobs";
import { bearerTokenMatches } from "@cofounderai/core/lib/timing-safe";

/**
 * EXP-PLAT-06 -- the daily sweep of background exports: deletes every file past its
 * seven-day expiry from the private `exports` bucket and marks its job expired, so a
 * generated file never outlives its retention window. Same shared-secret auth as every
 * other cron route here, since the caller is a scheduler, not a signed-in user.
 */
export async function GET(request: Request) {
  if (!bearerTokenMatches(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expiredCount = await expireExportJobs();
  return NextResponse.json({ expiredCount });
}
