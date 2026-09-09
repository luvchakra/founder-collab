import { decryptApiKey } from "@cofounderai/core/crypto/api-key";

/**
 * Shared "call a business's own configured GSP" HTTP helper -- used by both
 * einvoicing/mutations.ts and eway-bill/mutations.ts (S-2). Not exported past this
 * module: every caller already has the row of credentials in hand (read via the admin
 * client, since neither credentials table grants `authenticated` a SELECT at all), this
 * just turns them into request headers.
 *
 * A GSP (GST Suvidha Provider) is reached over plain HTTPS with either a client-id/
 * client-secret pair or a username/password Basic auth, depending on provider -- both
 * fields exist on both credential tables, so this sends whichever pair is actually set
 * rather than assuming one particular provider's convention.
 */
export type GspCredentials = {
  gsp_username: string | null;
  gsp_password: string | null;
  client_id: string | null;
  client_secret: string | null;
};

/** Decrypts a credentials row straight off `gst.eway_bill_credentials`/
 * `einvoice_credentials` (2026-09-09 -- `encrypted_gsp_password`/`encrypted_client_secret`,
 * previously plaintext `gsp_password`/`client_secret`, docs/testing/
 * EXECUTION-2026-09-08.md finding 3) into the plaintext `GspCredentials` shape
 * `callGsp()` itself still expects -- the one place in this module that ever needs the
 * plaintext, immediately before the one outbound request that needs it. */
export function decryptGspSecrets(row: {
  gsp_username: string | null;
  encrypted_gsp_password: string | null;
  client_id: string | null;
  encrypted_client_secret: string | null;
}): GspCredentials {
  return {
    gsp_username: row.gsp_username,
    gsp_password: row.encrypted_gsp_password ? decryptApiKey(row.encrypted_gsp_password) : null,
    client_id: row.client_id,
    client_secret: row.encrypted_client_secret ? decryptApiKey(row.encrypted_client_secret) : null,
  };
}

export async function callGsp(
  url: string,
  credentials: GspCredentials,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (credentials.client_id) headers["client-id"] = credentials.client_id;
  if (credentials.client_secret) headers["client-secret"] = credentials.client_secret;
  if (credentials.gsp_username && credentials.gsp_password) {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.gsp_username}:${credentials.gsp_password}`).toString("base64")}`;
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    throw new Error(`GSP request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
