import { NextResponse } from "next/server";
import { expireExportJobs } from "@cofounderai/core/exports/jobs";

/**
 * EXP-PLAT-06 -- the daily sweep of background exports: deletes every file past its
 * seven-day expiry from the private `exports` bucket and marks its job expired, so a
 * generated file never outlives its retention window. Same shared-secret auth as every
 * other cron route here, since the caller is a scheduler, not a signed-in user.
 */
export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const expiredCount = await expireExportJobs();
  return NextResponse.json({ expiredCount });
}
