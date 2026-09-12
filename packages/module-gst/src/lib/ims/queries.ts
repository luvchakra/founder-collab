import { createClient } from "../../db/server";
import type { ImsAction, ImsActionHistoryEntry, ImsActionValue } from "./types";

/** Deliberately NOT wrapped in React's `cache()` -- `mutations.ts` reads an action back
 * immediately after writing it within the same request, same reasoning
 * `lib/returns/lifecycle/queries.ts` and `lib/gstr2b/queries.ts` already document for why
 * their own reads aren't `cache()`'d either. */

const IMS_ACTION_COLUMNS = "id, business_id, gstr2b_document_id, action, remarks, action_history, acted_by, acted_at, created_at, updated_at";

function mapRow(row: {
  id: string;
  business_id: string;
  gstr2b_document_id: string;
  action: string;
  remarks: string | null;
  action_history: unknown;
  acted_by: string | null;
  acted_at: string;
  created_at: string;
  updated_at: string;
}): ImsAction {
  return {
    id: row.id,
    businessId: row.business_id,
    gstr2bDocumentId: row.gstr2b_document_id,
    action: row.action as ImsActionValue,
    remarks: row.remarks,
    actionHistory: (row.action_history as ImsActionHistoryEntry[] | null) ?? [],
    actedBy: row.acted_by,
    actedAt: row.acted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `null` when no explicit IMS action has ever been recorded for this document -- see
 * `status.ts`'s own `effectiveImsStatus` for how a caller should surface that. */
export async function getImsAction(businessId: string, gstr2bDocumentId: string): Promise<ImsAction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ims_actions")
    .select(IMS_ACTION_COLUMNS)
    .eq("business_id", businessId)
    .eq("gstr2b_document_id", gstr2bDocumentId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

/** Every recorded IMS action for a whole GSTR-2B statement, keyed by
 * `gstr2b_document_id` -- the shape a document-list UI actually wants (one lookup, not N
 * calls to `getImsAction`). `documentIds` narrows to exactly the statement's own
 * documents rather than trusting an unfiltered `business_id` query alone, matching this
 * module's own "never trust a client-supplied id without server-side authorization"
 * discipline for anything that ends up keying a UI lookup. */
export async function listImsActionsForDocuments(businessId: string, documentIds: string[]): Promise<Map<string, ImsAction>> {
  if (documentIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from("ims_actions").select(IMS_ACTION_COLUMNS).eq("business_id", businessId).in("gstr2b_document_id", documentIds);
  if (error) throw error;
  return new Map(data.map((row) => [row.gstr2b_document_id, mapRow(row)]));
}
