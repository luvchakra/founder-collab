// @vitest-environment jsdom
/**
 * BYOK settings. The page must never render the key — only a fingerprint of it — and it
 * has to be honest when a stored key has stopped working, because every AI feature in the
 * app fails on that key and this screen is where a founder finds out why.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/types";

const h = vi.hoisted(() => ({
  getCurrentAccount: vi.fn(),
  getAiProviderConnection: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
}));
vi.mock("@cofounderai/module-discovery/lib/ai-providers/queries", () => ({
  getAiProviderConnection: h.getAiProviderConnection,
}));
vi.mock("./actions", () => ({ connectProviderAction: vi.fn(), disconnectProviderAction: vi.fn() }));

const { default: AiProviderSettingsPage } = await import("./page");

function connection(overrides: Partial<AiProviderConnection> = {}): AiProviderConnection {
  return {
    provider: "anthropic",
    keyFingerprint: "9f2c",
    status: "connected",
    lastValidatedAt: "2026-03-01T00:00:00Z",
    lastError: null,
    ...overrides,
  };
}

const renderPage = () => AiProviderSettingsPage().then(render);

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
  h.getAiProviderConnection.mockResolvedValue(null);
});

afterEach(cleanup);

describe("AiProviderSettingsPage", () => {
  it("sends a signed-out visitor to login", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.getAiProviderConnection).not.toHaveBeenCalled();
  });

  it("states that AI runs on the founder's own account, never a shared one", async () => {
    await renderPage();

    expect(
      screen.getByText(/we never use a shared or company-owned AI account on your\s+behalf/),
    ).toBeInTheDocument();
  });

  it("offers a plain connect form when nothing is connected yet", async () => {
    await renderPage();

    expect(h.getAiProviderConnection).toHaveBeenCalledWith("acct-1");
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
  });

  it("shows only a fingerprint of a connected key, never the key", async () => {
    h.getAiProviderConnection.mockResolvedValue(connection());

    await renderPage();

    const fingerprint = screen.getByText("••••••••••••9f2c");
    // named next to the fingerprint, not just as the pre-selected radio in the replace form
    expect(fingerprint.previousElementSibling).toHaveTextContent("Anthropic");
    expect(screen.getByText("✓ Connected")).toBeInTheDocument();
  });

  it("offers to replace the key, pre-selecting the connected provider", async () => {
    h.getAiProviderConnection.mockResolvedValue(connection({ provider: "openai" }));

    await renderPage();

    expect(screen.getByRole("button", { name: "Replace key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "OpenAI" })).toBeChecked();
  });

  it("says plainly when the stored key has stopped working, and why", async () => {
    h.getAiProviderConnection.mockResolvedValue(
      connection({ status: "error", lastError: "That API key was revoked." }),
    );

    await renderPage();

    expect(screen.getByText("Connection error")).toBeInTheDocument();
    expect(screen.getByText("That API key was revoked.")).toBeInTheDocument();
  });

  it("omits the error line when there is no recorded failure", async () => {
    h.getAiProviderConnection.mockResolvedValue(connection({ status: "error" }));

    await renderPage();

    expect(screen.getByText("Connection error")).toBeInTheDocument();
    expect(screen.queryByText(/revoked/)).not.toBeInTheDocument();
  });
});
