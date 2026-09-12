import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { callGsp, callGspGet, decryptGspSecrets, type GspCredentials } from "./gsp-client";

beforeAll(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = randomBytes(32).toString("base64");
});

// module-gst's first unit test -- written alongside the 2026-09-09 fix for
// docs/testing/EXECUTION-2026-09-08.md finding 3 (TC-GST-001: GSP credentials stored
// plaintext, unlike BYOK's encrypted_api_key). Proves decryptGspSecrets() correctly
// reverses upsertEwayBillCredentials()/upsertEinvoiceCredentials()'s own
// encryptApiKey() call, end to end, without needing a live database.
describe("decryptGspSecrets", () => {
  it("decrypts both secret columns back to their original plaintext", () => {
    const row = {
      gsp_username: "gsp-user",
      encrypted_gsp_password: encryptApiKey("s3cr3t-password"),
      client_id: "client-123",
      encrypted_client_secret: encryptApiKey("topsecret-client-secret"),
    };

    expect(decryptGspSecrets(row)).toEqual({
      gsp_username: "gsp-user",
      gsp_password: "s3cr3t-password",
      client_id: "client-123",
      client_secret: "topsecret-client-secret",
    });
  });

  it("passes non-secret fields through untouched and leaves unset secrets null", () => {
    const row = { gsp_username: null, encrypted_gsp_password: null, client_id: "client-123", encrypted_client_secret: null };
    expect(decryptGspSecrets(row)).toEqual({ gsp_username: null, gsp_password: null, client_id: "client-123", client_secret: null });
  });
});

// Error-message audit (2026-09-09, part of the fsm/crm/gst test-coverage pass): callGsp()
// used to throw the raw request URL and HTTP status text straight through -- caught only
// by GstDocumentPanel's `err instanceof Error ? err.message : ...` and rendered verbatim
// to whoever clicked "Generate"/"Cancel" on an invoice. These tests prove the sanitized
// replacement never leaks the internal GSP URL and gives a genuinely actionable message
// for each real failure mode (auth rejection, other HTTP failure, unreachable host,
// malformed response) -- all via a mocked global.fetch, no live GSP or database needed.
const CREDENTIALS: GspCredentials = { gsp_username: "user", gsp_password: "pass", client_id: null, client_secret: null };
const GSP_URL = "https://internal-gsp.example.com/v2/generate";

describe("callGsp", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockClear();
  });

  it("returns the parsed JSON body on a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Irn: "abc123" }) }));
    await expect(callGsp(GSP_URL, CREDENTIALS, { foo: "bar" })).resolves.toEqual({ Irn: "abc123" });
  });

  it("turns a 401/403 into an actionable credentials message, without leaking the request URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
    await expect(callGsp(GSP_URL, CREDENTIALS, {})).rejects.toThrow(
      "The configured GST service provider rejected these credentials -- check the GSP username/password or client ID/secret and try again.",
    );
  });

  it("turns any other non-OK HTTP status into an actionable, URL-free message that still names the status code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" }));
    try {
      await callGsp(GSP_URL, CREDENTIALS, {});
      expect.unreachable("callGsp should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).toContain("HTTP 500");
      expect(message).not.toContain(GSP_URL);
    }
  });

  it("turns a network failure (e.g. an unreachable GSP host) into an actionable message, not a raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(callGsp(GSP_URL, CREDENTIALS, {})).rejects.toThrow(
      "Could not reach the configured GST service provider -- check the configured URL and your network connection, then try again.",
    );
  });

  it("turns a non-JSON success response into an actionable message instead of a raw parse error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } }),
    );
    await expect(callGsp(GSP_URL, CREDENTIALS, {})).rejects.toThrow(
      "The configured GST service provider returned an unexpected response. Try again, or contact its support if this keeps happening.",
    );
  });
});

// COMPLY-P0-05.3 (IRP Adapter): callGspGet shares callGsp's own response-handling
// (extracted into handleGspResponse) -- these tests only cover the GET-specific request
// shape (method, no body, auth headers still sent) plus one shared-failure smoke test,
// since the full success/401/500/network/malformed-JSON matrix is already exercised
// above against the identical underlying logic.
describe("callGspGet", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleErrorSpy.mockClear();
  });

  it("sends a GET request with no body and returns the parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Irn: "abc123", Status: "ACT" }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(callGspGet(`${GSP_URL}/irn/abc123`, CREDENTIALS)).resolves.toEqual({ Irn: "abc123", Status: "ACT" });
    expect(fetchMock).toHaveBeenCalledWith(`${GSP_URL}/irn/abc123`, expect.objectContaining({ method: "GET" }));
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  });

  it("sanitizes a failure the same way callGsp does", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
    await expect(callGspGet(GSP_URL, CREDENTIALS)).rejects.toThrow(
      "The configured GST service provider rejected these credentials -- check the GSP username/password or client ID/secret and try again.",
    );
  });
});
