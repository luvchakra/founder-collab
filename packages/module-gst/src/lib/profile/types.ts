/**
 * The GST-relevant slice of `core.business_settings` (C-2) -- gstin/state/
 * gst_registration_type. Ported from stockpilot-ai-ops's account.tsx "GST profile"
 * card, which edited the same fields on its own `organizations` table (this platform
 * already has the canonical home for them in `core.business_settings`, per the entity-
 * ownership map -- no new table needed for this piece). No row exists for a business
 * until its first save (there's no create-business trigger that seeds one), so `null`
 * means "not set up yet", not an error.
 */
export type GstProfile = {
  business_id: string;
  gstin: string | null;
  state: string | null;
  gst_registration_type: string;
};
