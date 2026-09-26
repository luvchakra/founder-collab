import { runPlatformExport } from "@cofounderai/core/exports/platform";
import { runBusinessExport } from "@cofounderai/core/exports/server";
import { EXPORT_ADAPTERS, PLATFORM_EXPORT_ADAPTERS } from "@/lib/exports/registry";
import { handleLargeExport } from "@/lib/exports/large-export";

/**
 * EXP-PLAT-05 -- the single download endpoint behind every Export button:
 * `GET /api/exports/<module>.<resource>?business=<slug>&format=csv|xlsx&scope=view|all&...filters`
 * (platform-administration exports, `platform.<resource>`, take no business).
 *
 * Deliberately thin: the adapter is looked up here, and everything that decides whether
 * the file may be produced -- session, business membership, licence, permission (or
 * superadmin), audit -- happens in core's runBusinessExport()/runPlatformExport().
 * `/api/*` is outside the proxy's session gate, so those functions authenticate the
 * request themselves.
 */
export const dynamic = "force-dynamic";
// Workbooks of a few thousand rows take a few seconds to build; larger ones are handed
// to a background job before they get anywhere near this (EXP-PLAT-06).
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const { exportId } = await params;
  const platformAdapter = PLATFORM_EXPORT_ADAPTERS[exportId];
  if (platformAdapter) return runPlatformExport(request, platformAdapter);
  const adapter = EXPORT_ADAPTERS[exportId];
  if (!adapter) {
    return Response.json({ error: "not_found", message: "Unknown export." }, { status: 404 });
  }
  return runBusinessExport(request, adapter, { largeExport: handleLargeExport });
}
