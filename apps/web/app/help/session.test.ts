import { beforeEach, describe, expect, it, vi } from "vitest";

// Every help page checks the session on the server, not only in the proxy.

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ auth: { getClaims: h.getClaims } }) }));

const { requireHelpSession, hasHelpSession } = await import("./session");

beforeEach(() => vi.clearAllMocks());

describe("requireHelpSession", () => {
  it("sends a signed-out visitor to sign-in, remembering the guide", async () => {
    h.getClaims.mockResolvedValue({ data: null, error: null });

    await expect(requireHelpSession("/help/finance")).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fhelp%2Ffinance");
    expect(await hasHelpSession()).toBe(false);
  });

  it("lets a signed-in user through", async () => {
    h.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });

    await expect(requireHelpSession("/help")).resolves.toBeUndefined();
    expect(await hasHelpSession()).toBe(true);
  });
});
