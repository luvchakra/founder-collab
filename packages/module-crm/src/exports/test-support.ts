import type { ExportContext } from "@cofounderai/core/exports/server";
import type { ExportSheet, ExportWorkbookDefinition } from "@cofounderai/core/exports/types";

/**
 * Test-only helpers for the EXP-CRM-01..10 adapter tests (never imported by an adapter):
 * a resolved export context, and readers that evaluate a workbook's columns the same
 * way the writers do -- header -> getValue(row).
 */

export const BUSINESS_ID = "biz-crm-1";

export function exportContext(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    businessId: BUSINESS_ID,
    businessSlug: "acme",
    businessName: "Acme Traders",
    timeZone: "Asia/Kolkata",
    userId: "user-1",
    userEmail: "owner@example.com",
    format: "xlsx",
    scope: "view",
    ...overrides,
  };
}

/** Request params as the export route hands them to `parseFilters` -- including the
 * route's own `business`/`format`/`scope` and a hostile `businessId`/`workspaceId`. */
export function requestParams(extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    business: "acme",
    format: "csv",
    scope: "all",
    businessId: "biz-other",
    workspaceId: "ws-other",
    ...extra,
  });
}

export function sheet(workbook: ExportWorkbookDefinition, name: string): ExportSheet<unknown> {
  const found = workbook.sheets.find((s) => s.sheetName === name);
  if (!found) throw new Error(`No sheet "${name}" in ${workbook.sheets.map((s) => s.sheetName).join(", ")}`);
  return found as ExportSheet<unknown>;
}

export function headers(workbook: ExportWorkbookDefinition, name: string): string[] {
  return sheet(workbook, name).columns.map((c) => c.header);
}

/** Every row of a sheet as { header: value }. */
export function rowsOf(workbook: ExportWorkbookDefinition, name: string): Record<string, unknown>[] {
  const s = sheet(workbook, name);
  return s.rows.map((row) => Object.fromEntries(s.columns.map((c) => [c.header, c.getValue(row)])));
}

/** Every value every sheet would write, as one string -- for "this never appears" checks. */
export function serialized(workbook: ExportWorkbookDefinition): string {
  return JSON.stringify(workbook.sheets.map((_, i) => rowsOf(workbook, workbook.sheets[i]!.sheetName)));
}
