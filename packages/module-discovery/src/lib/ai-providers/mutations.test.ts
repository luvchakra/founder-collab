/**
 * BYOK key storage. The rule stated in the docstring is the one worth guarding: the key
 * is validated against the provider *before* anything is persisted, so
 * ai_provider_credentials never holds a key that failed its first validation. The key is
 * also encrypted at rest and fingerprinted for display — the plaintext must never reach a
 * stored column.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  // Deliberately do NOT echo the key back: the ciphertext assertion below is meaningless
  // if the stand-in embeds the plaintext it is supposed to have replaced.
  encryptApiKey: vi.fn(() => "ciphertext-blob"),
  fingerprintApiKey: vi.fn((k: string) => `fp(${k.slice(-4)})`),
  testProviderConnection: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/crypto/api-key", () => ({
  encryptApiKey: h.encryptApiKey,
  fingerprintApiKey: h.fingerprintApiKey,
}));
vi.mock("@cofounderai/core/ai-providers/test-connection", () => ({
  testProviderConnection: h.testProviderConnection,
}));

const { connectAiProvider, disconnectAiProvider } = await import("./mutations");

const ACCOUNT = "acct-1";
const KEY = "sk-live-secret-1234";

function mock(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: null, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.testProviderConnection.mockResolvedValue({ ok: true });
});

describe("connectAiProvider", () => {
  it("validates against the provider before persisting anything", async () => {
    const supabase = mock();

    await connectAiProvider(ACCOUNT, "anthropic", KEY);

    expect(h.testProviderConnection).toHaveBeenCalledWith("anthropic", KEY);
    expect(supabase.queries("ai_provider_credentials")).toHaveLength(1);
  });

  it("persists nothing when the provider rejects the key", async () => {
    const supabase = mock();
    h.testProviderConnection.mockResolvedValue({ ok: false, error: "That API key was rejected." });

    await expect(connectAiProvider(ACCOUNT, "openai", KEY)).rejects.toThrow("That API key was rejected.");
    expect(supabase.queries()).toEqual([]);
  });

  it("stores the key encrypted and fingerprinted, never in plaintext", async () => {
    const supabase = mock();

    await connectAiProvider(ACCOUNT, "anthropic", KEY);

    const row = opArgs(supabase.queries("ai_provider_credentials")[0]!, "upsert")![0] as Record<string, unknown>;
    expect(h.encryptApiKey).toHaveBeenCalledWith(KEY);
    expect(row.encrypted_api_key).toBe("ciphertext-blob");
    expect(row.key_fingerprint).toBe("fp(1234)");
    expect(JSON.stringify(row)).not.toContain(KEY);
  });

  it("marks the connection connected and stamps a validation time", async () => {
    const supabase = mock();

    await connectAiProvider(ACCOUNT, "google", KEY);

    const row = opArgs(supabase.queries("ai_provider_credentials")[0]!, "upsert")![0] as Record<string, unknown>;
    expect(row).toMatchObject({ account_id: ACCOUNT, provider: "google", status: "connected", last_error: null });
    expect(row.last_validated_at).toEqual(expect.any(String));
  });

  it("upserts on account_id — one connection per account, replacing any previous one", async () => {
    const supabase = mock();

    await connectAiProvider(ACCOUNT, "openai", KEY);

    expect(opArgs(supabase.queries("ai_provider_credentials")[0]!, "upsert")![1]).toEqual({
      onConflict: "account_id",
    });
  });

  it("trims the key before validating and storing it", async () => {
    const supabase = mock();

    await connectAiProvider(ACCOUNT, "openai", `  ${KEY}  `);

    expect(h.testProviderConnection).toHaveBeenCalledWith("openai", KEY);
    expect(h.encryptApiKey).toHaveBeenCalledWith(KEY);
    expect(supabase.queries("ai_provider_credentials")).toHaveLength(1);
  });

  it.each([["an empty key", ""], ["a whitespace key", "   "]])(
    "rejects %s without calling the provider",
    async (_label, key) => {
      const supabase = mock();

      await expect(connectAiProvider(ACCOUNT, "openai", key)).rejects.toThrow("API key is required.");
      expect(h.testProviderConnection).not.toHaveBeenCalled();
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("propagates a failed write", async () => {
    mock(new Error("upsert denied"));

    await expect(connectAiProvider(ACCOUNT, "openai", KEY)).rejects.toThrow("upsert denied");
  });
});

describe("disconnectAiProvider", () => {
  it("deletes the account's credential", async () => {
    const supabase = mock();

    await disconnectAiProvider(ACCOUNT);

    const call = supabase.queries("ai_provider_credentials")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ account_id: ACCOUNT });
  });

  it("propagates a failure", async () => {
    mock(new Error("denied"));
    await expect(disconnectAiProvider(ACCOUNT)).rejects.toThrow("denied");
  });
});
