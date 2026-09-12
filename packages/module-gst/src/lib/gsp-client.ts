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

function gspAuthHeaders(credentials: GspCredentials): Record<string, string> {
  const headers: Record<string, string> = {};
  if (credentials.client_id) headers["client-id"] = credentials.client_id;
  if (credentials.client_secret) headers["client-secret"] = credentials.client_secret;
  if (credentials.gsp_username && credentials.gsp_password) {
    headers.Authorization = `Basic ${Buffer.from(`${credentials.gsp_username}:${credentials.gsp_password}`).toString("base64")}`;
  }
  return headers;
}

/** Error-message audit (2026-09-09): a failure here used to surface as `` `GSP request
 * to ${url} failed: ${response.status} ${response.statusText}` `` -- thrown straight
 * through `generateEinvoice`/`cancelEinvoice`/`generateEwayBill`/`cancelEwayBill`,
 * caught only by `GstDocumentPanel`'s own `err instanceof Error ? err.message : ...`,
 * and rendered verbatim to whoever clicked "Generate"/"Cancel". That leaked the
 * business's own configured GSP endpoint URL into the UI and gave a business owner a
 * raw HTTP status code instead of anything they could act on. The url/status/cause are
 * still logged server-side (via `console.error`) for whoever debugs this later -- only
 * the message shown to the *caller* (and from there, the end user) is sanitized.
 *
 * Shared between `callGsp` (POST, used by submit/cancel) and `callGspGet` (COMPLY-P0-05.3
 * IRP Adapter's own status/fetch, GET) -- extracted so both response-side failure modes
 * are sanitized identically rather than maintaining the message text in two places. */
async function handleGspResponse(url: string, response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) {
    console.error(`GSP request to ${url} failed: ${response.status} ${response.statusText}`);
    if (response.status === 401 || response.status === 403) {
      throw new Error("The configured GST service provider rejected these credentials -- check the GSP username/password or client ID/secret and try again.");
    }
    throw new Error(`The configured GST service provider could not process this request (HTTP ${response.status}). Try again, or check your GSP credentials and configured URLs.`);
  }

  try {
    return await response.json();
  } catch (cause) {
    console.error(`GSP request to ${url} returned a response that wasn't valid JSON:`, cause);
    throw new Error("The configured GST service provider returned an unexpected response. Try again, or contact its support if this keeps happening.");
  }
}

export async function callGsp(
  url: string,
  credentials: GspCredentials,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...gspAuthHeaders(credentials) };

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (cause) {
    console.error(`GSP request to ${url} failed to connect:`, cause);
    throw new Error("Could not reach the configured GST service provider -- check the configured URL and your network connection, then try again.");
  }

  return handleGspResponse(url, response);
}

/**
 * COMPLY-P0-05.3 (IRP Adapter): a GET counterpart to `callGsp` -- the real NIC/GSP
 * "Get IRN details" endpoints take the IRN as a path/query parameter with no request
 * body, unlike generate/cancel's own POST-with-body shape. Same auth-header and
 * error-sanitization behavior as `callGsp`, just a different HTTP method and no body.
 */
export async function callGspGet(url: string, credentials: GspCredentials): Promise<Record<string, unknown>> {
  const headers = gspAuthHeaders(credentials);

  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers });
  } catch (cause) {
    console.error(`GSP request to ${url} failed to connect:`, cause);
    throw new Error("Could not reach the configured GST service provider -- check the configured URL and your network connection, then try again.");
  }

  return handleGspResponse(url, response);
}
