import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { decryptGspSecrets } from "./gsp-client";

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
