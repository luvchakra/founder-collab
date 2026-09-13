"use server";

import { searchPlatformAuditLog, type AuditLogEntry, type AuditLogFilters } from "@cofounderai/core/admin/platform-audit-log";

/** PLATFORM-P0-16.3 ("Audit Search", §20). Thin wrapper -- see `platform-audit-log.ts`
 * for the actual merge/filter/severity logic. */
export async function searchAuditLogAction(filters: AuditLogFilters): Promise<AuditLogEntry[]> {
  return searchPlatformAuditLog(filters);
}
