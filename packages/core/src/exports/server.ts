import { writeAuditLog } from "../audit/mutations";
import { resolveBusinessIdBySlug } from "../businesses/resolve";
import { createClient } from "../db/server";
import { getPlatformModuleStatus, hasModule } from "../licensing/queries";
import { hasPermission } from "../rbac/require-permission";
import { primarySheet, renderExport } from "./render";
import { SYNC_EXPORT_ROW_LIMIT, type ExportFormat, type ExportScope, type ExportWorkbookDefinition } from "./types";

/**
 * EXP-PLAT-05 -- the one server-side path every business export runs through (§15).
 *
 * The request names *what* to export (an adapter id, a format, a scope, the page's
 * filters) and *which* business by its URL slug. Nothing in it is trusted as
 * authorization: the user comes from the session cookie, the business id from the slug
 * through the RLS-scoped client (a business the user isn't a member of resolves to
 * nothing, exactly as if the slug didn't exist), the licence and permission from the
 * database. Filters are selection criteria only. Every adapter then reads through the
 * same RLS-scoped client its page uses, so row-level access stays with the database.
 *
 * Every attempt that reaches a business -- served or failed -- is written to
 * core.audit_log as `export.generated` / `export.failed`, carrying only metadata (module,
 * resource, format, scope, row count, the filters' labels), never the data (§16).
 */

export type ExportContext = {
  businessId: string;
  businessSlug: string;
  businessName: string;
  timeZone: string;
  userId: string;
  userEmail: string | null;
  format: ExportFormat;
  scope: ExportScope;
};

export type ExportAdapter<F = Record<string, string>> = {
  /** `<module>.<resource>` -- the id the Export button asks for, e.g. `crm.leads`. */
  id: string;
  /** Licence key checked before anything is read; `null` for business-level data that no
   * single module owns (the Business page itself). */
  module: string | null;
  /** Permission keys the user must hold, all of them -- the page's own read permission. */
  permissions?: readonly string[];
  /** Turns the page's search params into typed selection criteria. Unknown params are
   * ignored; nothing here can widen what the user may read. */
  parseFilters?: (params: URLSearchParams) => F;
  /** Human labels for the active filters -- written to the audit entry and the Excel
   * "Export info" sheet. Never free text a user typed beyond the filter's own value. */
  describeFilters?: (filters: F) => Record<string, string>;
  load: (context: ExportContext, filters: F) => Promise<ExportWorkbookDefinition>;
};

/** Anything an adapter throws to deny an export with a message the user should see. */
export class ExportDeniedError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 = 403,
  ) {
    super(message);
    this.name = "ExportDeniedError";
  }
}

/** Where an export over the synchronous row limit is handed off (EXP-PLAT-06). Injected
 * by the host so this file stays free of any job/storage wiring. */
export type LargeExportHandler = (input: {
  context: ExportContext;
  adapterId: string;
  workbook: ExportWorkbookDefinition;
  filters: Record<string, string>;
}) => Promise<Response>;

const DEFAULT_TIME_ZONE = "Asia/Kolkata";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function parseFormat(value: string | null): ExportFormat | null {
  return value === "csv" || value === "xlsx" ? value : null;
}

export function parseScope(value: string | null): ExportScope {
  return value === "all" ? "all" : "view";
}

/** Keeps the audit entry to labels a person can read and a bounded size. */
function boundedFilters(filters: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== "")
      .slice(0, 20)
      .map(([key, value]) => [key.slice(0, 60), value.slice(0, 200)]),
  );
}

/** `attachment; filename="..."; filename*=UTF-8''...` -- both forms, so every browser
 * saves the file under our name. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function audit(
  context: ExportContext,
  action: "export.generated" | "export.failed",
  after: Record<string, unknown>,
): Promise<void> {
  await writeAuditLog({
    businessId: context.businessId,
    actorId: context.userId,
    action,
    entityType: "export",
    after,
  });
}

/**
 * Runs one export for a business: authenticate, resolve, license, permit, load, render,
 * audit, respond. `request` is the incoming GET; the adapter id has already been looked
 * up by the host route.
 */
export async function runBusinessExport<F>(
  request: Request,
  adapter: ExportAdapter<F>,
  options: { largeExport?: LargeExportHandler; rowLimit?: number } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const format = parseFormat(url.searchParams.get("format"));
  if (!format) return json(400, { error: "bad_request", message: "Choose CSV or Excel." });
  const scope = parseScope(url.searchParams.get("scope"));
  const slug = url.searchParams.get("business") ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "unauthenticated", message: "Sign in to export." });

  const businessId = slug ? await resolveBusinessIdBySlug(slug) : null;
  if (!businessId) return json(404, { error: "not_found", message: "Business not found." });

  const core = await createClient({ schema: "core" });
  const [{ data: business }, { data: settings }] = await Promise.all([
    core.from("businesses").select("name").eq("id", businessId).maybeSingle(),
    core.from("business_settings").select("timezone").eq("business_id", businessId).maybeSingle(),
  ]);

  if (adapter.module) {
    const platform = await getPlatformModuleStatus(adapter.module);
    if (platform.status === "disabled" || platform.status === "maintenance") {
      return json(403, { error: "module_unavailable", message: platform.message ?? "This module is unavailable right now." });
    }
    // Read access, not write: a module in its read-only grace period can still be
    // exported -- the grace period exists so a business can still get at its data (ADR-9).
    if (!(await hasModule(businessId, adapter.module))) {
      return json(403, { error: "MODULE_NOT_LICENSED", message: "This module isn't licensed for this business." });
    }
  }
  for (const key of adapter.permissions ?? []) {
    if (!(await hasPermission(businessId, key))) {
      return json(403, { error: "forbidden", message: "You don't have permission to export this." });
    }
  }

  const context: ExportContext = {
    businessId,
    businessSlug: slug,
    businessName: (business?.name as string | undefined) ?? slug,
    timeZone: (settings?.timezone as string | undefined) || DEFAULT_TIME_ZONE,
    userId: user.id,
    userEmail: user.email ?? null,
    format,
    scope,
  };

  const filters = adapter.parseFilters
    ? adapter.parseFilters(url.searchParams)
    : (Object.fromEntries(url.searchParams) as unknown as F);
  const filterLabels = boundedFilters(adapter.describeFilters ? adapter.describeFilters(filters) : {});
  // The licence module (e.g. "discovery" for a Marketing export) and the full export id,
  // so an audit reader can filter by module and still tell a Funding export from a
  // Discovery one.
  const [idModule, resource] = adapter.id.split(".");
  const base = { module: adapter.module ?? idModule, resource, export_id: adapter.id, format, scope, filters: filterLabels };

  let workbook: ExportWorkbookDefinition;
  try {
    workbook = await adapter.load(context, filters);
  } catch (error) {
    if (error instanceof ExportDeniedError) {
      // A refusal the adapter decided on (a record outside this business, a restricted
      // column set) is audited like any other attempt that reached the business.
      await audit(context, "export.failed", { ...base, reason: "denied" }).catch(() => undefined);
      return json(error.status, { error: error.status === 404 ? "not_found" : "forbidden", message: error.message });
    }
    await audit(context, "export.failed", { ...base, reason: "load" }).catch(() => undefined);
    console.error(`[exports] ${adapter.id} failed to load`, error);
    return json(500, { error: "export_failed", message: "We could not generate this export. No data was changed." });
  }

  const rowCount = primarySheet(workbook).rows.length;
  if (rowCount > (options.rowLimit ?? SYNC_EXPORT_ROW_LIMIT) && options.largeExport) {
    return options.largeExport({ context, adapterId: adapter.id, workbook, filters: filterLabels });
  }

  const generatedAt = new Date();
  try {
    const file = await renderExport(workbook, format, {
      timeZone: context.timeZone,
      generatedAt,
      info: {
        Business: context.businessName,
        "Generated by": context.userEmail ?? context.userId,
        Rows: scope === "all" ? "All matching records" : "Current view",
        ...(Object.keys(filterLabels).length > 0
          ? { Filters: Object.entries(filterLabels).map(([k, v]) => `${k}: ${v}`).join("; ") }
          : {}),
      },
    });
    // Audited before the file leaves: an export nobody can account for is not served.
    await audit(context, "export.generated", { ...base, row_count: file.rowCount });
    return new Response(file.body as BodyInit, {
      status: 200,
      headers: {
        "content-type": file.contentType,
        "content-disposition": contentDisposition(file.filename),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-export-row-count": String(file.rowCount),
      },
    });
  } catch (error) {
    await audit(context, "export.failed", { ...base, reason: "render" }).catch(() => undefined);
    console.error(`[exports] ${adapter.id} failed to render`, error);
    return json(500, { error: "export_failed", message: "We could not generate this export. No data was changed." });
  }
}
