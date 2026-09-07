import { createClient } from "../../db/server";

export type EwayBillCredentialsInput = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

/** Ported from stockpilot-ai-ops's `saveEwayBillCredentials` mutation. Upsert, not
 * create-or-update branching -- `gst.eway_bill_credentials` is keyed by `business_id`
 * alone (one credential set per business), so re-saving always replaces the existing row
 * (RLS's UPDATE policy covers the "already configured" case, INSERT the first-time one,
 * and upsert picks whichever applies without the caller needing to know which). */
export async function upsertEwayBillCredentials(
  businessId: string,
  input: EwayBillCredentialsInput,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("eway_bill_credentials").upsert({
    business_id: businessId,
    gsp_provider: input.gsp_provider,
    auth_url: input.auth_url,
    generate_url: input.generate_url,
    cancel_url: input.cancel_url,
    gsp_username: input.gsp_username || null,
    gsp_password: input.gsp_password || null,
    client_id: input.client_id || null,
    client_secret: input.client_secret || null,
  });
  if (error) throw error;
}
