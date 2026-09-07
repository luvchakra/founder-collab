import { createClient } from "../../db/server";

export type EinvoiceCredentialsInput = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

/** Ported from stockpilot-ai-ops's `saveEinvoiceCredentials` mutation -- see
 * eway-bill/mutations.ts's own docstring for why this is a plain upsert. */
export async function upsertEinvoiceCredentials(
  businessId: string,
  input: EinvoiceCredentialsInput,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("einvoice_credentials").upsert({
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
