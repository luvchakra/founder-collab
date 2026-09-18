/**
 * Key validation deliberately hits each provider's model-listing REST endpoint rather
 * than making a generation call (byok §7). Two properties matter and are pinned per
 * provider: the key goes only to the provider it belongs to and only in a header (never
 * a query string that could be logged), and every failure path returns a founder-readable
 * result rather than leaking the key or the raw provider error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testProviderConnection } from "./test-connection";

const KEY = "sk-secret-key-value";

function mockFetch(response: Partial<Response> | Error) {
  // Args typed explicitly: an inferred zero-arg mock gives `mock.calls` an empty tuple
  // type, and every assertion below reads the url and init it was called with.
  const fn = vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("testProviderConnection", () => {
  it.each(["openai", "anthropic", "google"] as const)("reports success for %s on a 2xx", async (provider) => {
    mockFetch({ ok: true, status: 200 });

    await expect(testProviderConnection(provider, KEY)).resolves.toEqual({ ok: true });
  });

  it.each([
    ["openai", "https://api.openai.com/v1/models"],
    ["anthropic", "https://api.anthropic.com/v1/models"],
    ["google", "https://generativelanguage.googleapis.com/v1beta/models"],
  ] as const)("sends %s's key to its own model-listing endpoint", async (provider, url) => {
    const fetchMock = mockFetch({ ok: true, status: 200 });

    await testProviderConnection(provider, KEY);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe(url);
  });

  it.each([
    ["openai", "Authorization", `Bearer ${KEY}`],
    ["anthropic", "x-api-key", KEY],
    ["google", "x-goog-api-key", KEY],
  ] as const)("passes %s's key in the %s header", async (provider, header, value) => {
    const fetchMock = mockFetch({ ok: true, status: 200 });

    await testProviderConnection(provider, KEY);

    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)[header]).toBe(value);
  });

  it.each(["openai", "anthropic", "google"] as const)(
    "never puts %s's key in the URL, where it could be logged",
    async (provider) => {
      const fetchMock = mockFetch({ ok: true, status: 200 });

      await testProviderConnection(provider, KEY);

      expect(String(fetchMock.mock.calls[0]![0])).not.toContain(KEY);
    },
  );

  it("sends anthropic's required API version header", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200 });

    await testProviderConnection("anthropic", KEY);

    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("bounds the request with a timeout signal, so a hung provider cannot hang the form", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200 });

    await testProviderConnection("openai", KEY);

    expect(fetchMock.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([401, 403])("reports a rejected key for HTTP %s", async (status) => {
    mockFetch({ ok: false, status });

    await expect(testProviderConnection("openai", KEY)).resolves.toEqual({
      ok: false,
      error: "That API key was rejected by the provider.",
    });
  });

  it("reports rate limiting distinctly, since retrying later will work", async () => {
    mockFetch({ ok: false, status: 429 });

    await expect(testProviderConnection("openai", KEY)).resolves.toEqual({
      ok: false,
      error: "The provider rate-limited this request. Try again shortly.",
    });
  });

  it("reports an unexpected status with its code, without leaking a body", async () => {
    mockFetch({ ok: false, status: 503 });

    const result = await testProviderConnection("openai", KEY);

    expect(result).toEqual({ ok: false, error: "Provider returned an unexpected error (HTTP 503)." });
  });

  it("turns a network failure into a readable result rather than throwing", async () => {
    mockFetch(new Error("ECONNREFUSED"));

    await expect(testProviderConnection("openai", KEY)).resolves.toEqual({
      ok: false,
      error: "Could not reach the provider. Check your network and try again.",
    });
  });

  it.each([
    ["a network failure", new Error("boom") as Error | Partial<Response>],
    ["a rejected key", { ok: false, status: 401 } as Error | Partial<Response>],
    ["an unexpected status", { ok: false, status: 500 } as Error | Partial<Response>],
  ])("never includes the API key in the error it returns for %s", async (_label, response) => {
    mockFetch(response);

    const result = await testProviderConnection("openai", KEY);

    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});
