import type { ExportAdapter, ExportContext } from "@cofounderai/core/exports/server";
import type { ExportFormat, ExportSheet, ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import { renderExport } from "@cofounderai/core/exports/render";

/**
 * EXP-FIN-01..17 -- shared scaffolding for the Finance adapter tests only (never imported
 * by an adapter). The context is what `runBusinessExport` would build after resolving the
 * slug server-side: the tests then prove each adapter reads `context.businessId` and
 * nothing a request parameter says.
 */
export const TENANT = "biz-finance-1";
export const OTHER_TENANT = "biz-someone-else";

export function exportContext(overrides: Partial<ExportContext> = {}): ExportContext {
  return {
    businessId: TENANT,
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

/** Search params as a hostile request might send them: a foreign tenant id riding along
 * with the page's own filters. */
export function params(values: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({ businessId: OTHER_TENANT, workspaceId: OTHER_TENANT, tenantId: OTHER_TENANT, ...values });
}

/** Runs an adapter the way the export route does: parse the params, then load. */
export async function runAdapter<F>(
  adapter: ExportAdapter<F>,
  values: Record<string, string> = {},
  context: Partial<ExportContext> = {},
): Promise<{ filters: F; workbook: ExportWorkbookDefinition }> {
  const filters = adapter.parseFilters ? adapter.parseFilters(params(values)) : ({} as F);
  const workbook = await adapter.load(exportContext(context), filters);
  return { filters, workbook };
}

export function sheet(workbook: ExportWorkbookDefinition, name: string): ExportSheet<unknown> {
  const found = workbook.sheets.find((s) => s.sheetName === name);
  if (!found) throw new Error(`No sheet named ${name}; have ${workbook.sheets.map((s) => s.sheetName).join(", ")}`);
  return found;
}

export function headers(workbook: ExportWorkbookDefinition, name: string): string[] {
  return sheet(workbook, name).columns.map((c) => c.header);
}

/** One row of a sheet as `{ header: value }`, exactly as the writers would read it. */
export function rowValues(workbook: ExportWorkbookDefinition, name: string, index = 0): Record<string, unknown> {
  const s = sheet(workbook, name);
  const row = s.rows[index];
  return Object.fromEntries(s.columns.map((c) => [c.header, c.getValue(row as never)]));
}

/** Every cell value of every sheet, serialized -- for "this field never appears" checks. */
export function everyValue(workbook: ExportWorkbookDefinition): string {
  return JSON.stringify(
    workbook.sheets.map((s) => s.rows.map((row) => s.columns.map((c) => c.getValue(row as never)))),
  );
}

export async function renderText(workbook: ExportWorkbookDefinition, format: ExportFormat = "csv"): Promise<string> {
  const file = await renderExport(workbook, format, { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T10:00:00Z") });
  return new TextDecoder().decode(file.body);
}

/** The CSV's rows (RFC 4180 CRLF line ends, BOM dropped). */
export async function csvLines(workbook: ExportWorkbookDefinition): Promise<string[]> {
  return (await renderText(workbook, "csv"))
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((line) => line !== "");
}

/** A one-invoice, one-purchase month of GST registers (EXP-FIN-07/12/13 tests). */
export const SALES = {
  invoiceCount: 1,
  taxableValue: 1000,
  cgst: 90,
  sgst: 90,
  igst: 0,
  totalTax: 180,
  missingGstinCount: 0,
  invalidGstinCount: 0,
  b2b: [{ invoiceNumber: "INV-1", invoiceDate: "2026-08-05", customerName: "Mehta & Co", gstin: "27ABCDE1234F1Z5", taxableValue: 1000, cgst: 90, sgst: 90, igst: 0 }],
  b2c: [],
  byHsn: [],
  creditNotes: [],
  creditTaxableValue: 0,
  creditTax: 0,
  netTaxableValue: 1000,
  netTax: 180,
};
export const PURCHASES = {
  poCount: 1,
  poIds: ["po-1"],
  taxableValue: 500,
  cgst: 45,
  sgst: 45,
  igst: 0,
  totalTax: 90,
  bySupplier: [],
  byHsn: [],
  csvRows: [
    { po_number: "PO-1", order_date: "2026-08-03", supplier_name: "Sharma Supplies", supplier_gstin: null, subtotal: 500, cgst: 45, sgst: 45, igst: 0, gstinStatus: "No GSTIN — likely unregistered, check reverse charge" },
  ],
};
