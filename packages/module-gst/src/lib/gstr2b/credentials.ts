import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { decryptGspSecrets, type GspCredentials } from "../gsp-client";

/**
 * COMPLY-P0-08.1: `gst.gstr2b_credentials` read/write -- same shape as
 * `einvoicing/mutations.ts`'s own `upsertEinvoiceCredentials`/credential-read pair. See
 * `supabase/migrations/20260912130000_gst_gstr2b_credentials.sql`'s own docstring for why
 * this table exists (an OPTIONAL adapter-based fetch path) alongside the manual-upload
 * path `mutations.ts` always supports regardless of whether this is configured.
 */
export type Gstr2bCredentialsInput = {
  gsp_provider: string;
  fetch_url: string;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

export async function upsertGstr2bCredentials(businessId: string, input: Gstr2bCredentialsInput): Promise<void> {
  await requireModule(businessId, "gst");
  const supabase = await createClient();
  const { error } = await supabase.from("gstr2b_credentials").upsert({
    business_id: businessId,
    gsp_provider: input.gsp_provider,
    fetch_url: input.fetch_url,
    gsp_username: input.gsp_username || null,
    encrypted_gsp_password: input.gsp_password ? encryptApiKey(input.gsp_password) : null,
    client_id: input.client_id || null,
    encrypted_client_secret: input.client_secret ? encryptApiKey(input.client_secret) : null,
  });
  if (error) throw error;
}

/** Reads and decrypts a business's own configured GSTR-2B fetch credentials -- admin
 * client only, same "no SELECT grant to `authenticated` at all" reasoning as every other
 * GSP credential read in this module. `null` when nothing is configured yet (the normal
 * case for a business that only ever uses manual upload). */
export async function getGstr2bFetchCredentials(businessId: string): Promise<{ fetchUrl: string; credentials: GspCredentials } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("gstr2b_credentials")
    .select("fetch_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { fetchUrl: data.fetch_url, credentials: decryptGspSecrets(data) };
}
