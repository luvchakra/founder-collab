import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { getImsAction } from "./queries";
import type { ImsAction, ImsActionHistoryEntry, ImsActionValue } from "./types";

/**
 * COMPLY-P0-08.4: the only write path onto `gst.ims_actions`. `gst.
 * enforce_gstr2b_document_business_id` (the migration's own trigger) is the AUTHORITATIVE
 * guard that `gstr2bDocumentId` actually belongs to `businessId` -- this function does not
 * re-check that itself, matching how `createReturnPeriod`/`transition` in
 * `lib/returns/lifecycle/mutations.ts` trust their own table's constraints rather than
 * re-deriving them in application code.
 */

async function currentUserId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function historyEntry(action: ImsActionValue, remarks: string | null, by: string | null): ImsActionHistoryEntry {
  return { action, remarks, at: new Date().toISOString(), by };
}

/**
 * Records (or changes) the IMS action on one GSTR-2B document. Idempotent in the sense
 * that recording the SAME action again still appends a new history entry (a business
 * re-confirming its own decision is itself worth an audit trail entry, not silently
 * skipped) -- only the actual VALUE changing matters for what a caller sees next via
 * `getImsAction`/`effectiveImsStatus`.
 *
 * `remarks` matches GSTN's own October-2025-onward "add remarks on Reject or Pending"
 * capability (COMPLY-P0-08.1's own research) -- accepted trivially in this function for
 * any action value (no `action === 'accepted'` restriction), since a business explaining
 * WHY it accepted something is a reasonable, harmless addition this platform has no
 * reason to forbid, even though GSTN's own UI reserves it for Reject/Pending.
 */
export async function recordImsAction(businessId: string, gstr2bDocumentId: string, action: ImsActionValue, remarks?: string): Promise<ImsAction> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_reconciliation");

  const trimmedRemarks = remarks?.trim();
  if (remarks !== undefined && !trimmedRemarks) {
    throw new Error("A remark, if provided, cannot be blank.");
  }
  const remarksValue = trimmedRemarks ?? null;

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  const existing = await getImsAction(businessId, gstr2bDocumentId);
  const history = [...(existing?.actionHistory ?? []), historyEntry(action, remarksValue, userId)];

  const { error } = await supabase.from("ims_actions").upsert(
    {
      business_id: businessId,
      gstr2b_document_id: gstr2bDocumentId,
      action,
      remarks: remarksValue,
      action_history: history,
      acted_by: userId,
      acted_at: new Date().toISOString(),
    },
    { onConflict: "gstr2b_document_id" },
  );
  if (error) throw error;

  const updated = await getImsAction(businessId, gstr2bDocumentId);
  if (!updated) throw new Error("IMS action was recorded but could not be read back.");
  return updated;
}
