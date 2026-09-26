// EXP-DISC-01..12 -- fixtures shared by the customer-acquisition export tests (not an
// adapter; only the *.test.ts files next to it import this).
import type { ExportContext } from "@cofounderai/core/exports/server";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { Business, Product, Workspace } from "../../lib/tenancy/types";

export const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
export const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
export const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";
export const FOREIGN_WORKSPACE_ID = "55555555-5555-4555-8555-555555555555";
export const PROSPECT_ID = "66666666-6666-4666-8666-666666666666";

export function makeContext(overrides: Partial<ExportContext> = {}): ExportContext {
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

export function makeBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: BUSINESS_ID,
    account_id: "acct-1",
    name: "Acme Ltd",
    description: "Industrial sensors",
    website: "https://acme.example",
    industry: "Manufacturing",
    logo_url: null,
    created_at: "2026-09-01T04:30:00Z",
    updated_at: "2026-09-02T04:30:00Z",
    disabled_at: null,
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    business_id: BUSINESS_ID,
    name: "Sensor Suite",
    description: "Wireless sensors",
    website: "https://acme.example/sensors",
    status: "active",
    linked_item_id: null,
    product_profile: null,
    product_profile_generated_at: null,
    category: "Hardware",
    offering_type: "professional_service",
    value_proposition: null,
    primary_problem: null,
    target_market: null,
    detailed_description: null,
    created_at: "2026-09-01T04:30:00Z",
    updated_at: "2026-09-02T04:30:00Z",
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: WORKSPACE_ID,
    product_id: PRODUCT_ID,
    name: "Sensor Suite",
    created_at: "2026-09-01T04:30:00Z",
    updated_at: "2026-09-01T04:30:00Z",
    rediscovery_interval: "off",
    next_discovery_at: null,
    discovery_min_score: null,
    discovery_geography_filter: [],
    discovery_industries_filter: [],
    discovery_buyer_roles_filter: [],
    discovery_exclusions: [],
    ...overrides,
  };
}

/** The page's own search params plus the tenant ids a tampered request might add --
 * every adapter must ignore the latter. */
export function tamperedParams(extra: Record<string, string> = {}): URLSearchParams {
  return new URLSearchParams({
    productId: PRODUCT_ID,
    businessId: OTHER_BUSINESS_ID,
    workspaceId: FOREIGN_WORKSPACE_ID,
    ...extra,
  });
}

function sheet(workbook: ExportWorkbookDefinition, name: string) {
  const found = workbook.sheets.find((s) => s.sheetName === name);
  if (!found) throw new Error(`No sheet named ${name}`);
  return found;
}

export function sheetNames(workbook: ExportWorkbookDefinition): string[] {
  return workbook.sheets.map((s) => s.sheetName);
}

export function headersOf(workbook: ExportWorkbookDefinition, name: string): string[] {
  return sheet(workbook, name).columns.map((c) => c.header);
}

/** Each row of a sheet as `{ header: value }`, values exactly as the adapter produced them. */
export function rowsOf(workbook: ExportWorkbookDefinition, name: string): Record<string, unknown>[] {
  const s = sheet(workbook, name);
  return s.rows.map((row) => Object.fromEntries(s.columns.map((c) => [c.header, c.getValue(row)])));
}

/** Every cell of every sheet, serialized -- for "this never appears anywhere" checks. */
export function serialized(workbook: ExportWorkbookDefinition): string {
  return JSON.stringify(workbook.sheets.map((s) => s.sheetName && rowsOf(workbook, s.sheetName)));
}
