/**
 * COMPLY-P0-08.4 (IMS Accept/Reject/Pending) -- see
 * `supabase/migrations/20260912160000_gst_ims_actions.sql`'s own docstring for the full
 * research trail (real IMS mechanics, why "deemed acceptance" is modeled as absence-of-
 * row rather than a fourth action value, and what was deliberately left out).
 */

/** What a person can actually record -- the database's own narrower vocabulary.
 * "Deemed accepted" (real GST practice for a document nobody ever acted on) is NOT a
 * value here; see `EffectiveImsStatus`/`effectiveImsStatus` below for where that surfaces. */
export type ImsActionValue = "accepted" | "rejected" | "pending";

export const IMS_ACTION_VALUES: ImsActionValue[] = ["accepted", "rejected", "pending"];

export type ImsActionHistoryEntry = {
  action: ImsActionValue;
  remarks: string | null;
  at: string;
  by: string | null;
};

export type ImsAction = {
  id: string;
  businessId: string;
  gstr2bDocumentId: string;
  action: ImsActionValue;
  remarks: string | null;
  actionHistory: ImsActionHistoryEntry[];
  actedBy: string | null;
  actedAt: string;
  createdAt: string;
  updatedAt: string;
};

/** The application-layer status vocabulary a UI actually renders -- widens
 * `ImsActionValue` with `"no_action"` for a document nobody has explicitly acted on yet
 * (real GST practice: "deemed accepted" once GSTR-3B is filed, but distinctly displayed
 * here rather than silently relabeled `"accepted"` before that has actually happened --
 * backlog rule 11, never claim a status that hasn't actually occurred). */
export type EffectiveImsStatus = ImsActionValue | "no_action";
