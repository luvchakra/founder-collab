/**
 * The AI router is the single place a workspace's BYOK credential is looked up, decrypted
 * and bound to a model. Two properties carry real weight:
 *
 *  - `encrypted_api_key` is selected here and nowhere else (the UI-facing query must never
 *    touch it), and the decrypted key must not reach an error the client can see.
 *  - Every provider SDK failure normalizes to one fixed AiErrorCode. byok §6 is explicit
 *    that no failure ever falls back to a company-owned AI account, so a misclassification
 *    is what decides whether a founder is told to fix their key or told to wait.
 */
import { APICallError, RetryError } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
const { getAccountIdForWorkspace } = vi.hoisted(() => ({ getAccountIdForWorkspace: vi.fn() }));
const { decryptApiKey } = vi.hoisted(() => ({ decryptApiKey: vi.fn() }));
const { resolveModelId } = vi.hoisted(() => ({ resolveModelId: vi.fn() }));
const { getOperationSpec } = vi.hoisted(() => ({ getOperationSpec: vi.fn() }));
const { createLanguageModel } = vi.hoisted(() => ({ createLanguageModel: vi.fn() }));
const { isAiOperationDisabled } = vi.hoisted(() => ({ isAiOperationDisabled: vi.fn(async () => false) }));

vi.mock("../../db/server", () => ({ createClient }));
vi.mock("../tenancy/queries", () => ({ getAccountIdForWorkspace }));
vi.mock("@cofounderai/core/crypto/api-key", () => ({ decryptApiKey }));
vi.mock("@cofounderai/core/ai/model-registry", () => ({ resolveModelId }));
vi.mock("@cofounderai/core/ai/operation-registry", () => ({ getOperationSpec }));
vi.mock("@cofounderai/core/ai/provider-factory", () => ({ createLanguageModel }));
vi.mock("@cofounderai/core/ai/feature-kill-switch", () => ({
  isAiOperationDisabled,
  AI_FEATURE_DISABLED_MESSAGE: "This AI feature is temporarily unavailable. Please try again later.",
}));

const { AiProviderError, resolveAiModel, toAiProviderError } = await import("./router");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";
const ACCOUNT = "a0000000-0000-0000-0000-000000000001";
const PLAINTEXT_KEY = "sk-decrypted-secret";

function mockCredential(row: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: row, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccountIdForWorkspace.mockResolvedValue(ACCOUNT);
  decryptApiKey.mockReturnValue(PLAINTEXT_KEY);
  resolveModelId.mockImplementation((provider: string, tier: string) => `${provider}-${tier}`);
  getOperationSpec.mockReturnValue({ qualityTier: "reasoning", requiresWebSearch: false });
  createLanguageModel.mockImplementation((p: string, _k: string, id: string) => ({ provider: p, id }));
});

describe("resolveAiModel", () => {
  it("resolves a model from the workspace's account credential", async () => {
    mockCredential({ provider: "anthropic", encrypted_api_key: "cipher" });

    const resolved = await resolveAiModel(WORKSPACE, "research_prospect");

    expect(resolved).toMatchObject({ accountId: ACCOUNT, provider: "anthropic", modelId: "anthropic-reasoning" });
    expect(decryptApiKey).toHaveBeenCalledWith("cipher");
  });

  it("is the only reader of encrypted_api_key, and scopes it to the account", async () => {
    const supabase = mockCredential({ provider: "openai", encrypted_api_key: "cipher" });

    await resolveAiModel(WORKSPACE, "research_prospect");

    const call = supabase.queries("ai_provider_credentials")[0]!;
    expect(String(opArgs(call, "select")![0])).toContain("encrypted_api_key");
    expect(eqFilters(call)).toEqual({ account_id: ACCOUNT });
  });

  it("asks the operation registry for the tier, and the factory for web search when required", async () => {
    getOperationSpec.mockReturnValue({ qualityTier: "fast", requiresWebSearch: true });
    mockCredential({ provider: "openai", encrypted_api_key: "cipher" });

    await resolveAiModel(WORKSPACE, "discover_prospects");

    expect(getOperationSpec).toHaveBeenCalledWith("discover_prospects");
    expect(createLanguageModel).toHaveBeenCalledWith("openai", PLAINTEXT_KEY, "openai-fast", {
      webSearch: true,
    });
  });

  it("builds a second tier from the same credential, with no extra fetch or decrypt", async () => {
    const supabase = mockCredential({ provider: "anthropic", encrypted_api_key: "cipher" });
    const resolved = await resolveAiModel(WORKSPACE, "research_prospect");
    createLanguageModel.mockClear();

    const fast = resolved.modelAtTier("fast", { webSearch: true });

    expect(fast).toMatchObject({ id: "anthropic-fast" });
    expect(createLanguageModel).toHaveBeenCalledWith("anthropic", PLAINTEXT_KEY, "anthropic-fast", {
      webSearch: true,
    });
    expect(supabase.queries("ai_provider_credentials")).toHaveLength(1);
    expect(decryptApiKey).toHaveBeenCalledTimes(1);
  });

  it("reports no_provider_connected for a workspace that resolves to no account", async () => {
    getAccountIdForWorkspace.mockResolvedValue(null);
    mockCredential(null);

    await expect(resolveAiModel(WORKSPACE, "research_prospect")).rejects.toMatchObject({
      name: "AiProviderError",
      code: "no_provider_connected",
    });
  });

  it("reports no_provider_connected when the account has connected no provider", async () => {
    mockCredential(null);

    await expect(resolveAiModel(WORKSPACE, "research_prospect")).rejects.toMatchObject({
      code: "no_provider_connected",
    });
    expect(decryptApiKey).not.toHaveBeenCalled();
  });

  it("uses a caller-supplied client (the webhook path has no signed-in user)", async () => {
    const supplied = createFakeSupabase({
      query: () => ({ data: { provider: "google", encrypted_api_key: "cipher" }, error: null }),
    });

    await resolveAiModel(WORKSPACE, "classify_reply", supplied as never);

    expect(createClient).not.toHaveBeenCalled();
    expect(getAccountIdForWorkspace).toHaveBeenCalledWith(WORKSPACE, supplied);
  });

  it("refuses an AI feature a superadmin switched off, before touching any credential (PLATFORM-P0-10.4)", async () => {
    isAiOperationDisabled.mockResolvedValueOnce(true);
    const supabase = mockCredential({ provider: "openai", encrypted_api_key: "cipher" });

    await expect(resolveAiModel(WORKSPACE, "generate_reply")).rejects.toMatchObject({ code: "feature_disabled" });
    expect(isAiOperationDisabled).toHaveBeenCalledWith("generate_reply");
    expect(supabase.queries("ai_provider_credentials")).toHaveLength(0);
    expect(decryptApiKey).not.toHaveBeenCalled();
  });

  it("propagates a failed credential lookup", async () => {
    mockCredential(null, new Error("select denied"));

    await expect(resolveAiModel(WORKSPACE, "research_prospect")).rejects.toThrow("select denied");
  });
});

describe("toAiProviderError", () => {
  function apiError(statusCode: number | undefined, message = "provider said no") {
    return new APICallError({ message, url: "https://api.example", requestBodyValues: {}, statusCode });
  }

  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it.each([
    [401, "invalid_key"],
    [403, "invalid_key"],
    [429, "rate_limited"],
    [404, "model_unavailable"],
    [500, "provider_unavailable"],
    [503, "provider_unavailable"],
    [418, "unknown"],
  ])("maps HTTP %s to '%s'", (status, code) => {
    expect(toAiProviderError(apiError(status), "anthropic").code).toBe(code);
  });

  it("maps an API error with no status to unknown", () => {
    expect(toAiProviderError(apiError(undefined), "openai").code).toBe("unknown");
  });

  it("omits the parenthesised detail when the failure carries no message", () => {
    // a thrown non-Error (or an Error with an empty message) must not render " ()"
    expect(toAiProviderError("just a string", "openai").message).not.toContain("(");
    expect(toAiProviderError(new Error(""), "openai").message).not.toContain("(");
  });

  it("classifies the last underlying attempt inside a RetryError, not the wrapper", () => {
    const retry = new RetryError({
      message: "retries exhausted",
      reason: "maxRetriesExceeded",
      errors: [apiError(500), apiError(429)],
    });

    expect(toAiProviderError(retry, "openai").code).toBe("rate_limited");
  });

  it("maps a timeout to 'timeout'", () => {
    const timeout = Object.assign(new Error("took too long"), { name: "TimeoutError" });

    expect(toAiProviderError(timeout, "google").code).toBe("timeout");
  });

  it("maps anything unrecognized to unknown rather than throwing", () => {
    expect(toAiProviderError("just a string", "openai").code).toBe("unknown");
    expect(toAiProviderError(new Error("boom"), "openai").code).toBe("unknown");
  });

  it("passes an existing AiProviderError through unchanged, without re-wrapping", () => {
    const original = new AiProviderError("no_provider_connected", "Connect a provider.");

    expect(toAiProviderError(original, "openai")).toBe(original);
  });

  it("does not log an already-classified error a second time", () => {
    toAiProviderError(new AiProviderError("invalid_key", "x"), "openai");

    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs the raw error server-side, so an unclassified failure stays diagnosable", () => {
    const raw = apiError(500);

    toAiProviderError(raw, "anthropic");

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("anthropic"), raw);
  });

  it("names the provider in the founder-facing message", () => {
    expect(toAiProviderError(apiError(401), "anthropic").message).toContain("anthropic");
  });

  it("appends the provider's own detail, and keeps the original as the cause", () => {
    const raw = apiError(429, "quota exceeded for this month");

    const wrapped = toAiProviderError(raw, "openai");

    expect(wrapped.message).toContain("quota exceeded for this month");
    expect(wrapped.cause).toBe(raw);
    expect(wrapped.provider).toBe("openai");
  });

  it("never surfaces a decrypted key, which providers do not echo back", () => {
    const wrapped = toAiProviderError(apiError(401, "invalid x-api-key header"), "anthropic");

    expect(wrapped.message).not.toContain(PLAINTEXT_KEY);
  });
});
