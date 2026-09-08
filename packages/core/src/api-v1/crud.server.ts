// Generic tenant-scoped CRUD handler factory for the simpler public API v1 resources,
// promoted from stockpilot-ai-ops's src/lib/api-v1/crud.server.ts. Resources whose
// creation also means creating line items (purchase orders, sales orders) are
// hand-written instead, since a single-table factory can't express that.
import { createAdminClient } from "../db/admin";
import type { ApiKeyContext } from "./auth.server";
import { requirePermission } from "./auth.server";
import { ApiError, jsonResponse, parseJsonBody, pick } from "./response";

// A dynamic (non-literal) `.select()` string makes supabase-js fall back to its
// GenericStringError sentinel type rather than a real row shape -- every call site here
// builds its select list from CrudConfig at runtime, so there's no literal to infer
// from. Matches the original stockpilot-ai-ops crud.server.ts's own `type AdminDb =
// any`: every caller already treats rows as untyped JSON in and out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any;

export interface CrudConfig {
  /** Postgres schema the table/view lives in (e.g. "inventory") -- resources live in
   * their owning module's own schema, never "core" or "public" directly. */
  schema: string;
  table: string;
  /** The tenant column this table/view is filtered by. Not uniform across this
   * platform's compat layer: SP-4's compat views (products, customers, suppliers,
   * purchase_orders, sales_orders, sales_invoices, ...) expose "org_id" (kept for
   * StockPilot-shape compatibility); genuinely inventory-native tables (warehouses,
   * stock_levels) use "business_id". Get this wrong and every query 500s or, worse,
   * silently returns zero rows -- there's no default. */
  filterColumn: string;
  listSelect: string;
  singleSelect?: string;
  defaultOrder?: { column: string; ascending?: boolean };
  /** Omit to make the resource read-only (e.g. stock levels, sales invoices). */
  writePermission?: string;
  insertFields?: readonly string[];
  updateFields?: readonly string[];
  /**
   * Columns that a permission-gated RLS-backed view would otherwise mask (e.g.
   * inventory.products hiding cost_price behind inventory.view_cost). That masking
   * resolves auth.uid() from the caller's session -- there isn't one under the
   * service-role client this whole API layer runs as, so it would always evaluate false
   * and hide the field from every API key regardless of its own snapshot. Reproduced
   * here against the key's actual permissions instead of relying on the view.
   */
  maskFields?: { column: string; permission: string }[];
  /** Query-string params that map directly onto an `.eq(column, value)` filter on the
   * list endpoint (e.g. stock-levels' item_id/warehouse_id) -- applied only when present
   * on the request. */
  queryFilters?: readonly string[];
}

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function applyMasking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  ctx: ApiKeyContext,
  maskFields: CrudConfig["maskFields"],
) {
  if (!row || !maskFields) return row;
  for (const { column, permission } of maskFields) {
    if (!ctx.permissions.includes(permission)) row[column] = null;
  }
  return row;
}

export function createCrudHandler(config: CrudConfig) {
  return async function handle(
    request: Request,
    ctx: ApiKeyContext,
    id: string | undefined,
    query: URLSearchParams,
  ): Promise<Response> {
    const db = createAdminClient({ schema: config.schema }) as AdminDb;

    if (request.method === "GET" && !id) {
      const limit = Math.min(Math.max(Number(query.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT);
      const offset = Math.max(Number(query.get("offset")) || 0, 0);
      let q = db
        .from(config.table)
        .select(config.listSelect, { count: "exact" })
        .eq(config.filterColumn, ctx.businessId);
      for (const param of config.queryFilters ?? []) {
        const value = query.get(param);
        if (value) q = q.eq(param, value);
      }
      if (config.defaultOrder) {
        q = q.order(config.defaultOrder.column, { ascending: config.defaultOrder.ascending ?? false });
      }
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) throw new ApiError(500, "internal_error", error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []).map((row: any) => applyMasking(row, ctx, config.maskFields));
      return jsonResponse({ data: rows, meta: { limit, offset, count: count ?? rows.length } });
    }

    if (request.method === "GET" && id) {
      const { data, error } = await db
        .from(config.table)
        .select(config.singleSelect ?? config.listSelect)
        .eq(config.filterColumn, ctx.businessId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new ApiError(500, "internal_error", error.message);
      if (!data) throw new ApiError(404, "not_found", `No ${config.table} found with that id.`);
      return jsonResponse({ data: applyMasking(data, ctx, config.maskFields) });
    }

    if (request.method === "POST" && !id) {
      if (!config.writePermission || !config.insertFields) {
        throw new ApiError(405, "method_not_allowed", `${config.table} is read-only via the API.`);
      }
      requirePermission(ctx, config.writePermission);
      const body = await parseJsonBody(request);
      const payload = pick(body, config.insertFields);
      const { data, error } = await db
        .from(config.table)
        .insert({ ...payload, [config.filterColumn]: ctx.businessId })
        .select(config.singleSelect ?? config.listSelect)
        .single();
      if (error) throw new ApiError(400, "invalid_request", error.message);
      return jsonResponse({ data }, 201);
    }

    if (request.method === "PATCH" && id) {
      if (!config.writePermission || !config.updateFields) {
        throw new ApiError(405, "method_not_allowed", `${config.table} cannot be updated via the API.`);
      }
      requirePermission(ctx, config.writePermission);
      const body = await parseJsonBody(request);
      const payload = pick(body, config.updateFields);
      const { data, error } = await db
        .from(config.table)
        .update(payload)
        .eq(config.filterColumn, ctx.businessId)
        .eq("id", id)
        .select(config.singleSelect ?? config.listSelect)
        .maybeSingle();
      if (error) throw new ApiError(400, "invalid_request", error.message);
      if (!data) throw new ApiError(404, "not_found", `No ${config.table} found with that id.`);
      return jsonResponse({ data });
    }

    throw new ApiError(
      405,
      "method_not_allowed",
      `${request.method} ${id ? "/{id}" : ""} is not supported on this resource.`,
    );
  };
}
