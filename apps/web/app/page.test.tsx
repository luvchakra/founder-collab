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

    await expect(Home().then(render)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("renders the landing page for a visitor who is not signed in", async () => {
    render(await Home());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your AI Co-Founder for Getting Customers.",
    );
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("keeps every section the navbar links to on the page", async () => {
    const { container } = render(await Home());

    for (const id of ["product", "how-it-works", "benefits", "pricing", "faq"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("renders the landing theme's own dark surface, not the app shell's", async () => {
    const { container } = render(await Home());

    expect(container.firstElementChild).toHaveClass("landing-theme", "dark", "bg-landing-bg");
  });
});
