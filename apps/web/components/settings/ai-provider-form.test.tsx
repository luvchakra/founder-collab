// @vitest-environment jsdom
/**
 * The BYOK key field: type="password" and autoComplete="off" so a founder's provider key
 * is never echoed on screen or captured by the browser's password manager, and the form
 * is submitted to a server action that tests the key before storing it (hence the
 * "Testing connection..." pending label rather than "Saving...").
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectProviderActionState } from "@/app/(dashboard)/dashboard/settings/ai-provider/actions";
import { AiProviderForm } from "./ai-provider-form";

const action =
  vi.fn<(prev: ConnectProviderActionState, formData: FormData) => Promise<ConnectProviderActionState>>();

function renderForm(props: Partial<Parameters<typeof AiProviderForm>[0]> = {}) {
  return render(<AiProviderForm action={action} submitLabel="Connect provider" {...props} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  action.mockResolvedValue(null);
});

afterEach(cleanup);

describe("AiProviderForm", () => {
  it("offers all three supported providers by their display labels", () => {
    renderForm();

    expect(screen.getByRole("radio", { name: "OpenAI" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Anthropic" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Google Gemini" })).toBeInTheDocument();
  });

  it("defaults to Anthropic when the account has no provider connected yet", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "Anthropic" })).toBeChecked();
  });

  it("pre-selects the provider already connected", () => {
    renderForm({ defaultProvider: "openai" });

    expect(screen.getByRole("radio", { name: "OpenAI" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Anthropic" })).not.toBeChecked();
  });

  it("keeps the key out of the browser's view and its password manager", () => {
    renderForm();

    const apiKey = screen.getByLabelText("API Key");
    expect(apiKey).toHaveAttribute("type", "password");
    expect(apiKey).toHaveAttribute("autocomplete", "off");
    expect(apiKey).toBeRequired();
  });

  it("submits the chosen provider with the key", async () => {
    const u = userEvent.setup();
    renderForm();

    await u.click(screen.getByRole("radio", { name: "Google Gemini" }));
    await u.type(screen.getByLabelText("API Key"), "sk-test-key");
    await u.click(screen.getByRole("button", { name: "Connect provider" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const formData = action.mock.calls[0]![1];
    expect(formData.get("provider")).toBe("google");
    expect(formData.get("apiKey")).toBe("sk-test-key");
  });

  it("uses the caller's submit label", () => {
    renderForm({ submitLabel: "Replace key" });
    expect(screen.getByRole("button", { name: "Replace key" })).toBeInTheDocument();
  });

  it("reports a failed connection test as an alert", async () => {
    const u = userEvent.setup();
    action.mockResolvedValue({ error: "That API key was rejected by Google." });
    renderForm();

    await u.type(screen.getByLabelText("API Key"), "sk-bad");
    await u.click(screen.getByRole("button", { name: "Connect provider" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That API key was rejected by Google.",
    );
  });

  it("says it is testing the connection while the action runs", async () => {
    const u = userEvent.setup();
    let release: (value: ConnectProviderActionState) => void = () => {};
    action.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderForm();

    await u.type(screen.getByLabelText("API Key"), "sk-test-key");
    await u.click(screen.getByRole("button", { name: "Connect provider" }));

    expect(await screen.findByRole("button", { name: "Testing connection..." })).toBeDisabled();
    release({ error: "nope" });
    await screen.findByRole("alert");
  });
});
