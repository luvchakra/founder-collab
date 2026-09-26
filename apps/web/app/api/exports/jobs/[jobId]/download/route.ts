import { NextResponse } from "next/server";
import { createClient } from "@cofounderai/core/db/server";
import { getExportJobDownloadUrl } from "@cofounderai/core/exports/jobs";

/**
 * EXP-PLAT-06 -- downloads a finished background export. The job is looked up through the
 * requester's own RLS-scoped session (a job id belonging to anyone else is simply not
 * found) and the browser is redirected to a five-minute signed URL for the private file.
 * The link in the bell is this route, never the signed URL itself, so nothing long-lived
 * ever points at the file.
 */
export const dynamic = "force-dynamic";

const MESSAGES = {
  not_found: "Export not found.",
  not_ready: "This export isn't ready yet.",
  expired: "This export has expired. Export the data again to get a fresh file.",
} as const;

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return Response.json({ message: MESSAGES.not_found }, { status: 404 });

  const result = await getExportJobDownloadUrl(jobId);
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "expired" ? 410 : 409;
    return Response.json({ message: MESSAGES[result.error] }, { status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.redirect(result.url, { headers: { "cache-control": "no-store" } });
}
