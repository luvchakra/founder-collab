// Entry point for every /api/v1/* request against module-fsm's resources -- same shape
// as module-inventory/api-v1/router.ts (this platform's own established pattern for a
// module-owned slice of the shared public API: resolve the key, check this module's
// own license, dispatch to the named resource). Dispatched to from apps/web's composite
// /api/v1 route handlers (api-v1/dispatch.ts), which decide WHICH module owns a given
// resource name via RESOURCE_OWNERS before ever calling here -- this file only needs to
// know its own resources, never another module's (lint:boundaries).
import { createAdminClient } from "@cofounderai/core/db/admin";
import type { ApiKeyContext } from "@cofounderai/core/api-v1/auth.server";
import { resolveApiKey } from "@cofounderai/core/api-v1/auth.server";
import { ApiError, errorResponse } from "@cofounderai/core/api-v1/response";
import { handle as jobs } from "./resources/jobs.server";

type ResourceHandler = (
  request: Request,
  ctx: ApiKeyContext,
  id: string | undefined,
  query: URLSearchParams,
) => Promise<Response>;

export const RESOURCES: Record<string, ResourceHandler> = { jobs };

/** Resolves the API key, checks the fsm license, and dispatches to the named resource
 * -- see module-inventory/api-v1/router.ts's own handleApiV1Request for why the license
 * check happens here rather than being assumed: this whole API layer runs as
 * service_role, which bypasses the "tenant AND licensed" RLS every table here carries,
 * so a lapsed fsm license must be checked explicitly. */
export async function handleApiV1Request(
  request: Request,
  resource: string,
  id: string | undefined,
  query: URLSearchParams,
): Promise<Response> {
  try {
    const handler = RESOURCES[resource];
    if (!handler) {
      throw new ApiError(404, "not_found", `Unknown resource '${resource}'.`);
    }

    const ctx = await resolveApiKey(request);

    const coreDb = createAdminClient({ schema: "core" });
    const { data: licensed, error: licenseError } = await coreDb.rpc("has_module", {
      p_business_id: ctx.businessId,
      p_key: "fsm",
    });
    if (licenseError) throw new ApiError(500, "internal_error", "Could not verify the fsm license.");
    if (!licensed) {
      throw new ApiError(403, "module_not_licensed", "This business does not have an active fsm (Service) license.");
    }

    return await handler(request, ctx, id, query);
  } catch (err) {
    return errorResponse(err);
  }
}
