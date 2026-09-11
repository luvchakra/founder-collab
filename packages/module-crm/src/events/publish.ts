import type { SupabaseClient } from "@supabase/supabase-js";
import { publish } from "@cofounderai/core/events/mutations";
import type { CrmEventPayloads, CrmEventType } from "./types";

/** CRM-01.4: the one function CRM code uses to publish a domain event -- constrains the
 * `type`/`payload` pair to the vocabulary in ./types.ts at compile time, so a typo'd
 * event name or a payload missing a required field fails typecheck instead of silently
 * writing a malformed `core.domain_events` row. Thin wrapper over
 * `@cofounderai/core/events/mutations`'s own `publish()` -- CRM never writes to
 * `core.domain_events` any other way (CRM-01.4's own acceptance criterion). `client`
 * (CRM-07.11) passes through to `publish()`'s own admin-client override for session-less
 * callers. */
export async function publishCrmEvent<T extends CrmEventType>(
  businessId: string,
  type: T,
  payload: CrmEventPayloads[T],
  requiredModule?: string,
  client?: SupabaseClient,
): Promise<void> {
  await publish({ businessId, type, payload, requiredModule }, client);
}
