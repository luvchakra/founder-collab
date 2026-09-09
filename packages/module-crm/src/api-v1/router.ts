// Entry point for every /api/v1/* request against module-crm's resources -- same shape
// as module-inventory/api-v1/router.ts and module-fsm/api-v1/router.ts.
import { createAdminClient } from "@cofounderai/core/db/admin";
import type { ApiKeyContext } from "@cofounderai/core/api-v1/auth.server";
import { resolveApiKey } from "@cofounderai/core/api-v1/auth.server";
import { ApiError, errorResponse } from "@cofounderai/core/api-v1/response";
import { handle as tickets } from "./resources/tickets.server";

type ResourceHandler = (
  request: Request,
  ctx: ApiKeyContext,
  id: string | undefined,
  query: URLSearchParams,
) => Promise<Response>;

export const RESOURCES: Record<string, ResourceHandler> = { tickets };

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
      p_key: "crm",
    });
    if (licenseError) throw new ApiError(500, "internal_error", "Could not verify the crm license.");
    if (!licensed) {
      throw new ApiError(403, "module_not_licensed", "This business does not have an active crm (CRM) license.");
    }

    return await handler(request, ctx, id, query);
  } catch (err) {
    return errorResponse(err);
  }
}
