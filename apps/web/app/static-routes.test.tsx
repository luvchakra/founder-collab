// @vitest-environment jsdom
/**
 * The routes with no data of their own: the auth shell, the static auth screens, the two
 * settings pages that exist so an account-menu link isn't dead, and every loading
 * skeleton. Individually trivial, but each is a real URL a founder can land on, and a
 * skeleton that rendered nothing would read as a broken page mid-navigation. Grouped into
 * one file rather than fifteen so the suite stays quick to run.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FREE_TIER_MONTHLY_COST_LIMIT_USD,
  FREE_TIER_MONTHLY_RUN_LIMIT,
} from "@cofounderai/module-discovery/lib/usage/limits";

vi.mock("next/navigation", () => ({ usePathname: () => "/login" }));
vi.mock("@/app/(auth)/actions", () => ({
  signup: vi.fn(),
  signInWithGoogle: vi.fn(),
  requestPasswordReset: vi.fn(),
}));

const { default: AuthLayout } = await import("./(auth)/layout");
const { default: ForgotPasswordPage } = await import("./(auth)/forgot-password/page");
const { default: ForgotPasswordCheckEmailPage } = await import("./(auth)/forgot-password/check-email/page");
const { default: SignupPage } = await import("./(auth)/signup/page");
const { default: SignupCheckEmailPage } = await import("./(auth)/signup/check-email/page");
const { default: AppearanceSettingsPage } = await import("./(dashboard)/dashboard/settings/appearance/page");
// the toggle reads the theme context the root layout provides
const { ThemeProvider } = await import("@cofounderai/core/theme/theme-provider");
const { default: BillingSettingsPage } = await import("./(dashboard)/dashboard/settings/billing/page");

const LOADING = await Promise.all(
  [
    ["business", () => import("./(dashboard)/dashboard/businesses/[businessId]/loading")],
    ["product", () => import("./(dashboard)/dashboard/businesses/[businessId]/products/[productId]/loading")],
    ["prospect discovery", () => import("./(dashboard)/dashboard/businesses/[businessId]/products/[productId]/prospects/discover/loading")],
    ["ai provider settings", () => import("./(dashboard)/dashboard/settings/ai-provider/loading")],
    ["appearance settings", () => import("./(dashboard)/dashboard/settings/appearance/loading")],
    ["billing settings", () => import("./(dashboard)/dashboard/settings/billing/loading")],
    ["licence settings", () => import("./(dashboard)/dashboard/settings/licenses/loading")],
    ["profile settings", () => import("./(dashboard)/dashboard/settings/profile/loading")],
    ["usage settings", () => import("./(dashboard)/dashboard/settings/usage/loading")],
  ].map(async ([name, load]) => {
    const loaded = await (load as () => Promise<{ default: () => React.ReactNode }>)();
    return [name as string, loaded.default] as const;
  }),
);

beforeEach(() => {
  // the theme provider resolves "system" through matchMedia, which jsdom doesn't implement
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthLayout", () => {
  it("frames the auth screens with the wordmark and the login/signup toggle", () => {
    render(<AuthLayout>{<p>form</p>}</AuthLayout>);

    expect(screen.getByRole("link", { name: "CoFounderAI" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Log In" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign Up" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText("form")).toBeInTheDocument();
  });
});

describe("SignupPage", () => {
  it("renders the signup form, not the login one", () => {
    render(<SignupPage />);

    expect(screen.getByRole("heading", { name: "Let's find your first customers." })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Account" })).toBeInTheDocument();
  });
});

describe("ForgotPasswordPage", () => {
  it("asks for the email to send the reset link to", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });
});

describe("check-your-email screens", () => {
  it("does not confirm whether the account exists after a reset request", () => {
    render(<ForgotPasswordCheckEmailPage />);

    // deliberately conditional: confirming the address would leak which emails have accounts
    expect(screen.getByText(/If an account exists for that email/)).toBeInTheDocument();
  });

  it("tells a new signup to confirm before logging in", () => {
    render(<SignupCheckEmailPage />);

    expect(screen.getByText(/Click it to finish creating your account/)).toBeInTheDocument();
  });
});

describe("AppearanceSettingsPage", () => {
  it("offers the theme toggle and says what System means", () => {
    render(
      <ThemeProvider>
        <AppearanceSettingsPage />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText(/follows your\s+OS setting/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument();
  });
});

describe("BillingSettingsPage", () => {
  it("is honest that there is nothing to bill yet, quoting the real free-tier limits", () => {
    render(<BillingSettingsPage />);

    expect(screen.getByText(/there's no\s+subscription or payment method to manage yet/)).toBeInTheDocument();
    expect(
      screen.getByText(`Up to ${FREE_TIER_MONTHLY_RUN_LIMIT} AI runs per workspace per month`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Up to $${FREE_TIER_MONTHLY_COST_LIMIT_USD} of AI spend per workspace per month`),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View your current usage/ })).toHaveAttribute(
      "href",
      "/dashboard/settings/usage",
    );
  });
});

describe.each(LOADING)("%s loading state", (_name, Loading) => {
  it("renders a skeleton rather than an empty frame", () => {
    const { container } = render(<Loading />);

    expect(container.firstElementChild).not.toBeNull();
    expect(container.querySelector(".animate-pulse, .animate-spin")).not.toBeNull();
  });
});
