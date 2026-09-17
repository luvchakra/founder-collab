// @vitest-environment jsdom
/**
 * Onboarding sits outside the dashboard shell (it is the pre-dashboard step), so it
 * carries its own auth guard — and it must bounce an account that already exists back to
 * the dashboard rather than letting them redo onboarding against a second account.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getCurrentAccount: vi.fn(),
  wizard: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({
  getCurrentAccount: h.getCurrentAccount,
}));
vi.mock("@cofounderai/module-discovery/components/onboarding/wizard", () => ({
  OnboardingWizard: (props: { accountId: string }) => {
    h.wizard(props);
    return <div data-testid="wizard" />;
  },
}));

const { default: OnboardingPage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  h.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } });
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1", name: "Ada" });
});

afterEach(cleanup);

describe("OnboardingPage", () => {
  it("sends a signed-out visitor to login", async () => {
    h.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null } }) } });

    await expect(OnboardingPage().then(render)).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.getCurrentAccount).not.toHaveBeenCalled();
  });

  it("sends a user with no account row to the dashboard rather than a broken wizard", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(OnboardingPage().then(render)).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("hands the wizard the account it will create the business under", async () => {
    render(await OnboardingPage());

    expect(screen.getByTestId("wizard")).toBeInTheDocument();
    expect(h.wizard).toHaveBeenCalledWith({ accountId: "acct-1" });
  });

  it("renders on the landing theme, matching where the visitor just came from", async () => {
    const { container } = render(await OnboardingPage());

    expect(container.firstElementChild).toHaveClass("landing-theme", "dark");
  });
});
