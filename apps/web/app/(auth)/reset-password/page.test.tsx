// @vitest-environment jsdom
/**
 * The reset link signs the visitor in before they land here, so "is there a session" is
 * exactly "is this link still valid" — an expired link must offer a way to request a new
 * one rather than a password form that cannot succeed.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  browserClient: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/client", () => ({ createClient: h.browserClient }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, replace: h.replace }),
}));
vi.mock("@/app/(auth)/actions", () => ({ updatePassword: vi.fn() }));

const { default: ResetPasswordPage } = await import("./page");

function mockUser(user: unknown) {
  h.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("ResetPasswordPage", () => {
  it("offers the password form to a visitor the reset link signed in", async () => {
    mockUser({ id: "u1" });

    render(await ResetPasswordPage());

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
  });

  it("explains an expired link and points at requesting a new one", async () => {
    mockUser(null);

    render(await ResetPasswordPage());

    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    // shown once the browser has confirmed there is no fragment to consume either
    expect(await screen.findByText(/This reset link is invalid or has expired\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "forgot password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });
});
