/**
 * BYOK provider construction. The security property is in the docstring and is what these
 * tests hold to: a model is built fresh per call from the one key it was given and never
 * cached, so one account's credential can never be reused for another's request. The
 * OpenAI split (`.responses()` for web search, `.chat()` otherwise) is a real API
 * constraint, not a style choice, so it is pinned too.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const openaiChat = vi.fn((id: string) => ({ via: "chat", id }));
const openaiResponses = vi.fn((id: string) => ({ via: "responses", id }));
const openaiWebSearchTool = vi.fn(() => ({ tool: "openai-web-search" }));
const anthropicWebSearchTool = vi.fn(() => ({ tool: "anthropic-web-search" }));
const googleSearchTool = vi.fn(() => ({ tool: "google-search" }));

const { createOpenAI, openai } = vi.hoisted(() => ({
  createOpenAI: vi.fn(),
  openai: { tools: { webSearch: vi.fn() } },
}));
const { createAnthropic, anthropic } = vi.hoisted(() => ({
  createAnthropic: vi.fn(),
  anthropic: { tools: { webSearch_20260209: vi.fn() } },
}));
const { createGoogle, google } = vi.hoisted(() => ({
  createGoogle: vi.fn(),
  google: { tools: { googleSearch: vi.fn() } },
}));

vi.mock("@ai-sdk/openai", () => ({ createOpenAI, openai }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic, anthropic }));
vi.mock("@ai-sdk/google", () => ({ createGoogle, google }));

const { createLanguageModel, createWebSearchTools } = await import("./provider-factory");

const KEY = "sk-account-specific-key";

beforeEach(() => {
  vi.clearAllMocks();
  createOpenAI.mockReturnValue({ chat: openaiChat, responses: openaiResponses });
  createAnthropic.mockReturnValue(vi.fn((id: string) => ({ provider: "anthropic", id })));
  createGoogle.mockReturnValue(vi.fn((id: string) => ({ provider: "google", id })));
  openai.tools.webSearch.mockImplementation(openaiWebSearchTool);
  anthropic.tools.webSearch_20260209.mockImplementation(anthropicWebSearchTool);
  google.tools.googleSearch.mockImplementation(googleSearchTool);
});

describe("createLanguageModel", () => {
  it.each([
    ["openai", () => createOpenAI],
    ["anthropic", () => createAnthropic],
    ["google", () => createGoogle],
  ] as const)("builds %s's client from the supplied key only", (provider, factory) => {
    createLanguageModel(provider, KEY, "some-model");

    expect(factory()).toHaveBeenCalledWith({ apiKey: KEY });
  });

  it("routes OpenAI through .chat() by default", () => {
    createLanguageModel("openai", KEY, "gpt-x");

    expect(openaiChat).toHaveBeenCalledWith("gpt-x");
    expect(openaiResponses).not.toHaveBeenCalled();
  });

  it("routes OpenAI through .responses() for web search, where that tool exists", () => {
    createLanguageModel("openai", KEY, "gpt-x", { webSearch: true });

    expect(openaiResponses).toHaveBeenCalledWith("gpt-x");
    expect(openaiChat).not.toHaveBeenCalled();
  });

  it.each(["anthropic", "google"] as const)(
    "has no chat/responses split for %s — web search changes nothing",
    (provider) => {
      const plain = createLanguageModel(provider, KEY, "model-1");
      const searching = createLanguageModel(provider, KEY, "model-1", { webSearch: true });

      expect(searching).toEqual(plain);
    },
  );

  it("constructs a fresh client per call, so keys are never shared between accounts", () => {
    createLanguageModel("openai", "key-account-a", "gpt-x");
    createLanguageModel("openai", "key-account-b", "gpt-x");

    expect(createOpenAI).toHaveBeenCalledTimes(2);
    expect(createOpenAI).toHaveBeenNthCalledWith(1, { apiKey: "key-account-a" });
    expect(createOpenAI).toHaveBeenNthCalledWith(2, { apiKey: "key-account-b" });
  });

  it("passes the model id straight through for every provider", () => {
    expect(createLanguageModel("anthropic", KEY, "claude-x")).toMatchObject({ id: "claude-x" });
    expect(createLanguageModel("google", KEY, "gemini-x")).toMatchObject({ id: "gemini-x" });
  });
});

describe("createWebSearchTools", () => {
  it.each([
    ["openai", "web_search"],
    ["anthropic", "web_search"],
    ["google", "google_search"],
  ] as const)("keys %s's tool as '%s', the name its request format requires", (provider, toolName) => {
    expect(Object.keys(createWebSearchTools(provider))).toEqual([toolName]);
  });

  it("bounds Anthropic's web-search cost per call", () => {
    createWebSearchTools("anthropic");

    expect(anthropic.tools.webSearch_20260209).toHaveBeenCalledWith({ maxUses: 6 });
  });

  it("keeps OpenAI's search context small, its equivalent cost lever", () => {
    createWebSearchTools("openai");

    expect(openai.tools.webSearch).toHaveBeenCalledWith({ searchContextSize: "low" });
  });

  it("passes no options to Google's tool, which has no such cap", () => {
    createWebSearchTools("google");

    expect(google.tools.googleSearch).toHaveBeenCalledWith({});
  });

  it("never takes an API key — the model alongside it is what authenticates", () => {
    expect(JSON.stringify(createWebSearchTools("openai"))).not.toContain(KEY);
  });
});
