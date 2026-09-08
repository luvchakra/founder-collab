// Entry point for every /api/v1/* request against module-inventory's resources.
// Promoted from stockpilot-ai-ops's src/lib/api-v1/router.server.ts, but the actual HTTP
// wiring moves to apps/web/app/api/v1/**/route.ts -- Next.js has real file-based API
// routes (App Router route handlers), unlike the TanStack Start version this was ported
// from, which had to intercept requests ahead of its app router entirely (see the
// source file's own comment on why). This module keeps the resource dispatch table and
// the one thing that isn't generic HTTP plumbing: the inventory license check.
import { createAdminClient } from "@cofounderai/core/db/admin";
import type { ApiKeyContext } from "@cofounderai/core/api-v1/auth.server";
import { resolveApiKey } from "@cofounderai/core/api-v1/auth.server";
import { ApiError, errorResponse, jsonResponse } from "@cofounderai/core/api-v1/response";
import { openApiSpec } from "./openapi";
import { handle as products } from "./resources/products.server";
import { handle as warehouses } from "./resources/warehouses.server";
import { handle as stockLevels } from "./resources/stock-levels.server";
import { handle as purchaseOrders } from "./resources/purchase-orders.server";
import { handle as salesOrders } from "./resources/sales-orders.server";
import { handle as customers } from "./resources/customers.server";
import { handle as suppliers } from "./resources/suppliers.server";
import { handle as salesInvoices } from "./resources/sales-invoices.server";

type ResourceHandler = (
  request: Request,
  ctx: ApiKeyContext,
  id: string | undefined,
  query: URLSearchParams,
) => Promise<Response>;

// Key names match the original API's own URL segments (kept for /inventory, whose
// backing table is now stock_levels) -- see stock-levels.server.ts's own comment.
const RESOURCES: Record<string, ResourceHandler> = {
  products,
  warehouses,
  inventory: stockLevels,
  "purchase-orders": purchaseOrders,
  "sales-orders": salesOrders,
  customers,
  suppliers,
  "sales-invoices": salesInvoices,
};

export function serveOpenApiSpec(): Response {
  return jsonResponse(openApiSpec);
}

/** Resolves the API key, checks the inventory license, and dispatches to the named
 * resource. `resource` is null for `openapi.json`, handled separately by the caller
 * (serveOpenApiSpec() above) since it needs no auth at all. */
export async function handleApiV1Request(
  request: Request,
  resource: string | undefined,
  id: string | undefined,
  query: URLSearchParams,
): Promise<Response> {
  try {
    const handler = resource ? RESOURCES[resource] : undefined;
    if (!handler) {
      throw new ApiError(
        404,
        "not_found",
        resource
          ? `Unknown resource '${resource}'. See GET /api/v1/openapi.json for the full list.`
          : "Specify a resource, e.g. /api/v1/products.",
      );
    }

    const ctx = await resolveApiKey(request);

    // The API layer runs as service_role (see auth.server.ts), which bypasses the
    // "tenant AND licensed" RLS every one of these compat views/tables carries -- so an
    // inventory license that has lapsed must be checked explicitly here, exactly like
    // contract/index.ts's own requireLicensed() does for a cross-module call (SP-9).
    // Uses the admin client directly (not core/licensing/queries' hasModule()) because
    // that helper goes through the session-scoped client -- there's no session on an
    // incoming API request, and core.has_module() is granted to `authenticated`, not
    // `anon`; the migration adds a service_role grant specifically for this call.
    const coreDb = createAdminClient({ schema: "core" });
    const { data: licensed, error: licenseError } = await coreDb.rpc("has_module", {
      p_business_id: ctx.businessId,
      p_key: "inventory",
    });
    if (licenseError) throw new ApiError(500, "internal_error", "Could not verify the inventory license.");
    if (!licensed) {
      throw new ApiError(
        403,
        "module_not_licensed",
        "This business does not have an active inventory license.",
      );
    }

    return await handler(request, ctx, id, query);
  } catch (err) {
    return errorResponse(err);
  }
}
