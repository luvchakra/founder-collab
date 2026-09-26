import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportFormat, ExportSheet, ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { CampaignMetricRow, MarketingCampaign } from "../../lib/marketing/types";

/**
 * EXP-MKT-01..07 / EXP-FND-01..10 -- shared fixtures for the Marketing and Funding export
 * adapter tests. Not imported by any adapter.
 */

export const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
/** A business the caller must never reach -- smuggled into request params by tests. */
export const OTHER_BUSINESS_ID = "99999999-9999-4999-8999-999999999999";

export function exportContext(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    businessId: BUSINESS_ID,
    businessSlug: "acme",
    businessName: "Acme Ltd",
    timeZone: "Asia/Kolkata",
    userId: "user-1",
    userEmail: "owner@example.com",
    format: "xlsx",
    scope: "view",
    ...overrides,
  };
}

/** Request params as the Export button sends them, including the tenant ids a hostile
 * client might add -- adapters must ignore those. */
export function params(values: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ business: "acme", businessId: OTHER_BUSINESS_ID, workspaceId: OTHER_BUSINESS_ID, ...values });
}

export function sheet(workbook: ExportWorkbookDefinition, name: string): ExportSheet<unknown> {
  const found = workbook.sheets.find((s) => s.sheetName === name);
  if (!found) throw new Error(`No sheet ${name}; have ${workbook.sheets.map((s) => s.sheetName).join(", ")}`);
  return found as ExportSheet<unknown>;
}

export function headers(workbook: ExportWorkbookDefinition, name: string): string[] {
  return sheet(workbook, name).columns.map((c) => c.header);
}

/** One row of a sheet as `{ header: value }`, values exactly as the adapter produced them. */
export function rowValues(workbook: ExportWorkbookDefinition, name: string, index = 0): Record<string, unknown> {
  const s = sheet(workbook, name);
  const row = s.rows[index];
  if (row === undefined) throw new Error(`Sheet ${name} has no row ${index}`);
  return Object.fromEntries(s.columns.map((c) => [c.header, c.getValue(row)]));
}

/** Every cell of every sheet as text -- for "this must never appear anywhere" checks. */
export function allCellText(workbook: ExportWorkbookDefinition): string {
  return workbook.sheets
    .flatMap((s) => s.rows.map((row) => s.columns.map((c) => JSON.stringify(c.getValue(row) ?? null)).join("|")))
    .concat(Object.values(workbook.metadata ?? {}))
    .join("\n");
}

export async function renderText(workbook: ExportWorkbookDefinition, format: ExportFormat = "csv"): Promise<string> {
  const file = await renderExport(workbook, format, { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body);
}

export const OFFERING = "22222222-2222-4222-8222-222222222222";

export function campaign(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return {
    id: "c-1",
    businessId: BUSINESS_ID,
    offeringId: OFFERING,
    offeringName: "Payroll suite",
    icpProfileId: null,
    name: "Spring launch",
    description: null,
    objective: "lead_generation",
    channel: "paid_social",
    budget: 50000,
    currency: "INR",
    startAt: "2026-09-01",
    endAt: "2026-12-31",
    landingPageUrl: "https://example.com/spring",
    message: null,
    cta: null,
    utm: {},
    status: "active",
    notes: null,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

export function metric(overrides: Partial<CampaignMetricRow> = {}): CampaignMetricRow {
  return {
    campaignId: "c-1",
    metricDate: "2026-09-20",
    source: "manual",
    impressions: null,
    clicks: null,
    sessions: 300,
    engagements: null,
    leads: 12,
    qualifiedLeads: null,
    opportunities: null,
    customers: 2,
    revenue: null,
    spend: null,
    currency: "INR",
    ...overrides,
  };
}
