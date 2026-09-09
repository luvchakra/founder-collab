import { hasModule } from "@cofounderai/core/licensing/queries";
import { num } from "@cofounderai/core/lib/format";
import { getOpenTicketsCount } from "../lib/dashboard/queries";
import type { ContractResult } from "./types";

/**
 * module-crm's public API surface (00-MASTER-PLAN.md §6 mechanism 2) -- the first
 * `contract/index.ts` this module has, mirroring module-inventory's/module-fsm's/
 * module-gst's own first ones. The ONLY thing another module may import from this
 * package (CLAUDE.md's architecture rule #3, CI-enforced by lint:boundaries).
 */

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "crm");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

/**
 * A short plain-language snapshot of this business's inbox -- what the AI assistant
 * grounds itself in when the founder is looking at CRM, or has opted into "consult all
 * modules." Reuses getOpenTicketsCount(), the same count the platform dashboard's own
 * module-widget row already shows.
 */
export async function getChatContextSummary(businessId: string): Promise<ContractResult<string>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const openTickets = await getOpenTicketsCount([businessId]);
  return {
    ok: true,
    data:
      openTickets > 0
        ? `CRM: ${num.format(openTickets)} open/pending ticket(s) in the inbox.`
        : "CRM: no open tickets in the inbox.",
  };
}
