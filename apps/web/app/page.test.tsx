// @vitest-environment jsdom
/**
 * "/" is the marketing page for a visitor and a redirect for anyone already signed in —
 * the one route that serves two audiences, so the redirect has to happen before any of
 * the landing sections render.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));

const { default: Home } = await import("./page");

type SearchParams = Record<string, string>;
const renderHome = (searchParams: SearchParams = {}) =>
  Home({ searchParams: Promise.resolve(searchParams) }).then(render);

function mockUser(user: unknown) {
  h.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  mockUser(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("sends a signed-in visitor straight to their dashboard", async () => {
    mockUser({ id: "u1" });

    await expect(renderHome()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("renders the landing page for a visitor who is not signed in", async () => {
    await renderHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your AI Co-Founder for Getting Customers.",
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("keeps every section the navbar links to on the page", async () => {
    const { container } = await renderHome();

    for (const id of ["product", "how-it-works", "benefits", "pricing", "faq"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("renders the landing theme's own dark surface, not the app shell's", async () => {
    const { container } = await renderHome();

    expect(container.firstElementChild).toHaveClass("landing-theme", "dark", "bg-landing-bg");
  });

  /**
   * Supabase drops an auth link here when the redirect the app asked for is not in the
   * project's allowlist. The marketing page has nothing that reads it, so every
   * confirmation and password-reset link would appear to do nothing at all.
   */
  it.each([
    ["a PKCE code", { code: "4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11" }, "code=4a4bd76b"],
    ["a token hash", { token_hash: "hash1", type: "recovery" }, "token_hash=hash1&type=recovery"],
    ["a rejection", { error: "access_denied", error_description: "Email link is invalid" }, "error=access_denied"],
  ])("forwards %s that landed here to the callback that can consume it", async (_label, params, expected) => {
    await expect(renderHome(params as Record<string, string>)).rejects.toThrow(
      new RegExp(`NEXT_REDIRECT:/auth/callback\\?.*${expected.split("&")[0]!.replace(/[?]/g, "")}`),
    );
  });

  it("keeps the destination the link asked for", async () => {
    await expect(
      renderHome({ code: "4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11", next: "/reset-password" }),
    ).rejects.toThrow(
      "NEXT_REDIRECT:/auth/callback?code=4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11&next=%2Freset-password",
    );
  });

  it("does not query the session before forwarding — the link is why they are here", async () => {
    await expect(renderHome({ code: "4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11" })).rejects.toThrow(
      "NEXT_REDIRECT:/auth/callback",
    );

    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("renders the landing page for every other query string", async () => {
    await renderHome({ utm_source: "twitter" });

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
