// Composite dispatcher for the platform's public API v1 -- previously hardwired to
// module-inventory alone (the only module with any api-v1 resources when this endpoint
// was first built). fsm/crm/gst each now expose their own resources through the exact
// same shape (their own api-v1/router.ts, mirroring module-inventory's own), so this is
// the one place that decides which module owns a given resource name and dispatches to
// it -- apps/web is the composition root, exempt from the module-to-module contract-only
// restriction, so importing every module's own router here is fine (lint:boundaries).
//
// Resource names are a flat namespace across all four modules by convention (no two
// modules may claim the same name) -- each of fsm/crm/gst exports its own RESOURCES map
// so this file can check membership without duplicating each module's resource list;
// inventory is tried last, as the fallback, since its own router already 404s on an
// unknown resource with the same message this file would otherwise have to duplicate.
// Each module's own router still independently checks that module's own license before
// serving, exactly as it did when this endpoint was inventory-only.
import { handleApiV1Request as inventoryHandler } from "@cofounderai/module-inventory/api-v1/router";
import { openApiSpec as inventoryOpenApiSpec } from "@cofounderai/module-inventory/api-v1/openapi";
import { handleApiV1Request as fsmHandler, RESOURCES as fsmResources } from "@cofounderai/module-fsm/api-v1/router";
import { handleApiV1Request as crmHandler, RESOURCES as crmResources } from "@cofounderai/module-crm/api-v1/router";
import { handleApiV1Request as gstHandler, RESOURCES as gstResources } from "@cofounderai/module-gst/api-v1/router";
import { openApiPaths as fsmOpenApiPaths } from "@cofounderai/module-fsm/api-v1/openapi";
import { openApiPaths as crmOpenApiPaths } from "@cofounderai/module-crm/api-v1/openapi";
import { openApiPaths as gstOpenApiPaths } from "@cofounderai/module-gst/api-v1/openapi";
import { jsonResponse, ApiError, errorResponse } from "@cofounderai/core/api-v1/response";
import { exceedsPayloadLimit, loadApiPolicy, recordApiError, requestBodyBytes } from "@cofounderai/core/api-v1/policy";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

type Handler = (request: Request, resource: string, id: string | undefined, query: URLSearchParams) => Promise<Response>;

const OTHER_MODULES: { resources: Record<string, unknown>; handle: Handler }[] = [
  { resources: fsmResources, handle: fsmHandler },
  { resources: crmResources, handle: crmHandler },
  { resources: gstResources, handle: gstHandler },
];

export async function dispatchApiV1Request(
  request: Request,
  resource: string,
  id: string | undefined,
  query: URLSearchParams,
): Promise<Response> {
  const response = await dispatch(request, resource, id, query);
  // PLATFORM-P1-06.4 / 07.2: count errors (status only) for the platform's API dashboard.
  if (response.status >= 400) recordApiError(response.status);
  return response;
}

async function dispatch(request: Request, resource: string, id: string | undefined, query: URLSearchParams): Promise<Response> {
  try {
    // PLATFORM-P1-06.1: the platform's payload limit, before any module parses the body.
    const policy = await loadApiPolicy();
    if (exceedsPayloadLimit(await requestBodyBytes(request), policy.maxPayloadKb)) {
      throw new ApiError(413, "payload_too_large", `Request body exceeds the ${policy.maxPayloadKb} KB limit.`);
    }
    for (const mod of OTHER_MODULES) {
      if (resource in mod.resources) {
        return await mod.handle(request, resource, id, query);
      }
    }
    return await inventoryHandler(request, resource, id, query);
  } catch (err) {
    return errorResponse(err instanceof ApiError ? err : new ApiError(500, "internal_error", "Unexpected error."));
  }
}

/** Merges every module's own `paths` fragment into inventory's base spec (which owns
 * the shared `info`/`components` every fragment reuses) -- served unauthenticated at
 * GET /api/v1/openapi.json, same as before this pass, just covering all four modules'
 * resources now instead of one. */
export function serveOpenApiSpec(): Response {
  return jsonResponse({
    ...inventoryOpenApiSpec,
    info: {
      ...inventoryOpenApiSpec.info,
      title: `${BRAND_NAME} Public API`,
      description:
        inventoryOpenApiSpec.info.description +
        " Also covers fsm (jobs), crm (tickets), and gst (einvoices) resources -- each still requires that module's own active license.",
    },
    paths: {
      ...inventoryOpenApiSpec.paths,
      ...fsmOpenApiPaths,
      ...crmOpenApiPaths,
      ...gstOpenApiPaths,
    },
  });
}
