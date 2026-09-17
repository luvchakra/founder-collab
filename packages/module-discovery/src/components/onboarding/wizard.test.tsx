// @vitest-environment jsdom
/**
 * Onboarding is the one place a founder meets the product before they have an account
 * context to fall back on, so the step machine has to be exact: step 3 doesn't exist
 * (the AI work happens *inside* the step-2 submit), "Edit" rewinds to step 1 and drops
 * the previous analysis rather than leaving a stale ICP to approve, and the approve call
 * is a plain client-side await — not a form action — so its in-flight and error states
 * are the component's own to get right.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProductProfile } from "../../lib/ai/schemas";

const h = vi.hoisted(() => ({
  runOnboardingAction: vi.fn<(prev: unknown, formData: FormData) => Promise<unknown>>(),
  approveOnboardingIcpAction: vi.fn<(icpId: string) => Promise<unknown>>(),
}));

vi.mock("../../actions/onboarding", () => ({
  runOnboardingAction: h.runOnboardingAction,
  approveOnboardingIcpAction: h.approveOnboardingIcpAction,
}));

const { OnboardingWizard } = await import("./wizard");

const PROFILE: ProductProfile = {
  category: "B2B SaaS - returns automation",
  problem: "Shops approve every return by hand",
  solution: "Auto-approves returns that match the policy",
  features: ["policy rules"],
  differentiators: ["no plugin needed"],
  target_industries: ["E-commerce"],
  target_roles: ["Ops Manager"],
  use_cases: ["returns triage"],
  pricing_summary: null,
  competitive_positioning: "cheaper than Loop",
  confidence: 0.8,
};

function icp(overrides: Partial<IcpProfile> = {}): IcpProfile {
  return {
    id: "icp-1",
    workspace_id: "ws-1",
    name: "DTC returns teams",
    description: "Small online stores drowning in return requests",
    industries: ["E-commerce"],
    company_sizes: ["10-50 employees"],
    geographies: ["US"],
    roles: ["Ops Manager"],
    pain_points: ["manual triage"],
    buying_signals: ["hiring support staff"],
    exclusions: [],
    status: "draft",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function result(overrides: { icp?: IcpProfile } = {}) {
  return {
    businessId: "biz-1",
    productId: "prod-1",
    icpId: "icp-1",
    profile: PROFILE,
    icp: overrides.icp ?? icp(),
  };
}

const user = () => userEvent.setup();

async function goToStep2(u: ReturnType<typeof user>, description = "A returns tool for shops") {
  await u.type(screen.getByLabelText("What are you building?"), description);
  await u.click(screen.getByRole("button", { name: "Next" }));
}

async function analyze(u: ReturnType<typeof user>, audience = "Small online stores") {
  await u.type(screen.getByLabelText("Who do you think needs it?"), audience);
  await u.click(screen.getByRole("button", { name: "Analyze" }));
}

async function goToStep4(u: ReturnType<typeof user>, icpOverride?: IcpProfile) {
  h.runOnboardingAction.mockResolvedValue({ data: result({ icp: icpOverride }) });
  await goToStep2(u);
  await analyze(u);
  await screen.findByText("Here's what I understand about your business.");
}

beforeEach(() => {
  vi.resetAllMocks();
  h.runOnboardingAction.mockResolvedValue(null);
  h.approveOnboardingIcpAction.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("OnboardingWizard — step 1", () => {
  it("asks what you're building and keeps Next disabled until you answer", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);

    expect(screen.getByRole("heading", { name: "Hey Founder 👋" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await u.type(screen.getByLabelText("What are you building?"), "   ");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await u.type(screen.getByLabelText("What are you building?"), "A returns tool");
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("advances to step 2 without calling the AI", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);

    await goToStep2(u);

    expect(screen.getByRole("heading", { name: "Who do you think needs it?" })).toBeInTheDocument();
    expect(h.runOnboardingAction).not.toHaveBeenCalled();
  });
});

describe("OnboardingWizard — step 2", () => {
  it("keeps Analyze disabled until the audience is answered", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u);

    expect(screen.getByRole("button", { name: "Analyze" })).toBeDisabled();
    await u.type(screen.getByLabelText("Who do you think needs it?"), "Shops");
    expect(screen.getByRole("button", { name: "Analyze" })).toBeEnabled();
  });

  it("goes Back to step 1 with the first answer still typed in", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u, "A returns tool for shops");

    await u.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByLabelText("What are you building?")).toHaveValue("A returns tool for shops");
  });

  it("submits the account id and both answers as form data", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u, "A returns tool");
    await analyze(u, "Small online stores");

    await waitFor(() => expect(h.runOnboardingAction).toHaveBeenCalledTimes(1));
    const formData = h.runOnboardingAction.mock.calls[0]![1];
    expect(formData.get("accountId")).toBe("acct-1");
    expect(formData.get("productDescription")).toBe("A returns tool");
    expect(formData.get("targetAudience")).toBe("Small online stores");
  });

  it("replaces the card with a thinking state while the analysis runs", async () => {
    const u = user();
    let release: (value: unknown) => void = () => {};
    h.runOnboardingAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u);
    await analyze(u);

    expect(await screen.findByText("I'm thinking...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analyze" })).not.toBeInTheDocument();

    release({ data: result() });
    await screen.findByText("Here's what I understand about your business.");
  });

  it("shows a returned error inline and stays on step 2", async () => {
    const u = user();
    h.runOnboardingAction.mockResolvedValue({ error: "Tell us who you think needs it." });
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u);
    await analyze(u);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tell us who you think needs it.");
    expect(screen.getByRole("button", { name: "Analyze" })).toBeInTheDocument();
    expect(screen.queryByText("What you can do:")).not.toBeInTheDocument();
  });

  it("offers the BYOK recovery options when the failure is a provider failure", async () => {
    const u = user();
    h.runOnboardingAction.mockResolvedValue({
      error: "Your OpenAI API key could not complete this request.",
    });
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep2(u);
    await analyze(u);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("What you can do:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI Provider settings" })).toHaveAttribute(
      "href",
      "/dashboard/settings/ai-provider",
    );
  });
});

describe("OnboardingWizard — step 4 review", () => {
  it("summarises the product profile and the drafted ICP", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u);

    expect(screen.getByText("B2B SaaS - returns automation")).toBeInTheDocument();
    expect(screen.getByText("Shops approve every return by hand")).toBeInTheDocument();
    expect(screen.getByText("Auto-approves returns that match the policy")).toBeInTheDocument();
    expect(screen.getByText("Ops Manager · E-commerce")).toBeInTheDocument();
    expect(
      screen.getByText("DTC returns teams — Small online stores drowning in return requests"),
    ).toBeInTheDocument();
  });

  it("falls back to the ICP description when it has no roles or industries", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u, icp({ roles: [], industries: [], description: "Anyone selling online" }));

    expect(screen.getByText("Anyone selling online")).toBeInTheDocument();
  });

  it("names the ICP alone when it came back without a description", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u, icp({ description: null }));

    expect(screen.getByText("DTC returns teams")).toBeInTheDocument();
  });

  it("rewinds to step 1 on Edit, keeping what was typed", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u);

    await u.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("heading", { name: "Hey Founder 👋" })).toBeInTheDocument();
    expect(screen.getByLabelText("What are you building?")).toHaveValue("A returns tool for shops");
  });

  it("approves the drafted ICP and moves to the finish line", async () => {
    const u = user();
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u);

    await u.click(screen.getByRole("button", { name: "Looks Good" }));

    expect(h.approveOnboardingIcpAction).toHaveBeenCalledWith("icp-1");
    expect(
      await screen.findByRole("heading", { name: "Ready to find your first customers?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Build My Customer Pipeline/ })).toHaveAttribute(
      "href",
      "/dashboard/businesses/biz-1/products/prod-1",
    );
  });

  it("locks both buttons while the approval is in flight", async () => {
    const u = user();
    let release: (value: unknown) => void = () => {};
    h.approveOnboardingIcpAction.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u);

    await u.click(screen.getByRole("button", { name: "Looks Good" }));

    const saving = await screen.findByRole("button", { name: "Saving..." });
    expect(saving).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();

    release(undefined);
    await screen.findByRole("heading", { name: "Ready to find your first customers?" });
  });

  it("keeps the review open when approval fails", async () => {
    const u = user();
    h.approveOnboardingIcpAction.mockResolvedValue({ error: "That ICP no longer exists." });
    render(<OnboardingWizard accountId="acct-1" />);
    await goToStep4(u);

    await u.click(screen.getByRole("button", { name: "Looks Good" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That ICP no longer exists.");
    expect(screen.getByRole("button", { name: "Looks Good" })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "Ready to find your first customers?" }),
    ).not.toBeInTheDocument();
  });
});
