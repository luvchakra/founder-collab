// @vitest-environment jsdom
/**
 * The landing page's content sections are static, so what's worth pinning is the set of
 * promises the requirements doc makes about them rather than their markup: one primary
 * CTA per section and every CTA pointing somewhere that exists (design principle 4 /
 * "CTA Enhancement" §4), no fabricated social proof (#20), the footer's unbuilt pages
 * rendered as clearly-disabled text instead of dead links, and pricing described as
 * provisional rather than as real prices.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Benefits } from "./benefits";
import { Differentiation } from "./differentiation";
import { Faq } from "./faq";
import { FinalCta } from "./final-cta";
import { Footer } from "./footer";
import { FounderProblem } from "./founder-problem";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { Pricing } from "./pricing";
import { ProspectIntelligence } from "./prospect-intelligence";
import { SocialProof } from "./social-proof";
import { Transformation } from "./transformation";
import { Trust } from "./trust";

beforeAll(() => {
  // FadeIn/AnimatedScore check reduced motion and observe on mount; jsdom implements
  // neither matchMedia nor IntersectionObserver.
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
});

afterEach(cleanup);

describe("Hero", () => {
  it("leads with one primary CTA and a secondary that stays on the page", () => {
    render(<Hero />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your AI Co-Founder for Getting Customers." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start Free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "See How It Works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
  });

  it("offers the lower-commitment Show Interest path alongside it", () => {
    render(<Hero />);
    expect(screen.getByRole("button", { name: "Show Interest" })).toBeInTheDocument();
  });

  it("anchors itself at #product so the navbar's Product link lands here", () => {
    const { container } = render(<Hero />);
    expect(container.querySelector("section")).toHaveAttribute("id", "product");
  });

  it("illustrates the dashboard with an obviously-sample prospect", () => {
    render(<Hero />);
    expect(screen.getByText("Acme Technologies")).toBeInTheDocument();
    expect(screen.getByText("ICP Fit: 94%")).toBeInTheDocument();
  });
});

describe("FounderProblem", () => {
  it("poses each of the five founder questions the product answers", () => {
    render(<FounderProblem />);

    for (const question of [
      "Who should I sell to?",
      "Who should I contact?",
      "Why would they care?",
      "Why now?",
      "What do I do next?",
    ]) {
      expect(screen.getByText(question)).toBeInTheDocument();
    }
  });
});

describe("HowItWorks", () => {
  it("numbers all five steps in order under the #how-it-works anchor", () => {
    const { container } = render(<HowItWorks />);

    expect(container.querySelector("section")).toHaveAttribute("id", "how-it-works");
    const steps = screen.getAllByText(/^Step \d$/).map((node) => node.textContent);
    expect(steps).toEqual(["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]);
  });

  it("keeps the founder in the approval loop at step 4", () => {
    render(<HowItWorks />);

    expect(screen.getByRole("heading", { name: "Approve & Reach Out" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "CoFounderAI creates personalized outreach. You review it before anything is sent.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ProspectIntelligence", () => {
  it("scores the sample prospect across every sub-score", () => {
    render(<ProspectIntelligence />);

    for (const label of ["ICP Fit", "Intent", "Timing", "Reachability"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Why Now?")).toBeInTheDocument();
    expect(screen.getByText("Who To Contact?")).toBeInTheDocument();
  });
});

describe("Benefits", () => {
  it("lists the six benefits under the #benefits anchor", () => {
    const { container } = render(<Benefits />);

    expect(container.querySelector("section")).toHaveAttribute("id", "benefits");
    for (const title of [
      "Know Your ICP",
      "Find Better Prospects",
      "Know Why They Might Buy",
      "Know When to Reach Out",
      "Send Better Outreach",
      "Always Know What To Do Next",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });
});

describe("Transformation", () => {
  it("contrasts the founder-alone path with the CoFounderAI one", () => {
    render(<Transformation />);

    const alone = screen.getByText("Founder, alone").parentElement!;
    const together = screen.getByText("Founder + CoFounderAI").parentElement!;
    expect(within(alone).getByText("No clear ICP")).toBeInTheDocument();
    expect(within(together).getByText("ICP identified")).toBeInTheDocument();
    expect(within(together).getAllByRole("listitem")).toHaveLength(8);
  });
});

describe("Differentiation", () => {
  it("pairs every 'traditional tool' claim with the CoFounderAI one", () => {
    render(<Differentiation />);

    expect(screen.getByText("Traditional AI Tool")).toBeInTheDocument();
    expect(screen.getByText("Generates emails")).toBeInTheDocument();
    expect(screen.getByText("Understands the prospect")).toBeInTheDocument();
    expect(screen.getByText("GTM co-founder")).toBeInTheDocument();
  });
});

describe("Trust", () => {
  it("shows the founder-approval flow ending in the AI learning from it", () => {
    render(<Trust />);

    for (const step of [
      "AI Researches",
      "AI Recommends",
      "Founder Reviews",
      "Founder Approves",
      "AI Learns",
    ]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("names the three BYOK providers without promising model selection", () => {
    render(<Trust />);

    for (const provider of ["OpenAI", "Anthropic", "Google"]) {
      expect(screen.getByText(provider)).toBeInTheDocument();
    }
    expect(
      screen.getByText(/CoFounderAI selects the appropriate model internally/),
    ).toBeInTheDocument();
  });

  it("states the security posture the platform actually implements", () => {
    render(<Trust />);

    expect(screen.getByText("Workspace-level data isolation")).toBeInTheDocument();
    expect(screen.getByText("Encrypted provider credentials")).toBeInTheDocument();
    expect(screen.getByText("No API keys exposed in the browser")).toBeInTheDocument();
  });
});

describe("SocialProof", () => {
  it("makes a claim about who it is built for, not a fabricated testimonial", () => {
    render(<SocialProof />);

    expect(
      screen.getByText("Built for founders who are building their first customer pipeline."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("Pricing", () => {
  it("marks the pricing as provisional", () => {
    render(<Pricing />);

    expect(screen.getByText(/Final pricing is still being finalized/)).toBeInTheDocument();
  });

  it("sends all three tiers to signup, featuring exactly one", () => {
    const { container } = render(<Pricing />);

    expect(container.querySelector("section")).toHaveAttribute("id", "pricing");
    for (const name of ["Free", "Founder", "Growth"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    const ctas = screen.getAllByRole("link");
    expect(ctas).toHaveLength(3);
    expect(ctas.every((cta) => cta.getAttribute("href") === "/signup")).toBe(true);
    expect(ctas.filter((cta) => cta.classList.contains("bg-landing-accent"))).toHaveLength(1);
  });
});

describe("Faq", () => {
  it("answers the licensing and isolation questions under the #faq anchor", () => {
    const { container } = render(<Faq />);

    expect(container.querySelector("section")).toHaveAttribute("id", "faq");
    expect(screen.getByText("Can I use my own AI provider?")).toBeInTheDocument();
    expect(
      screen.getByText("Is my product data isolated from other businesses?"),
    ).toBeInTheDocument();
  });

  it("is honest that outreach is not sent automatically", () => {
    render(<Faq />);

    expect(
      screen.getByText("Initially, no. The founder reviews and approves outreach before it is sent."),
    ).toBeInTheDocument();
  });

  it("collapses every answer by default", () => {
    const { container } = render(<Faq />);

    const details = [...container.querySelectorAll("details")];
    expect(details).toHaveLength(8);
    expect(details.every((d) => !d.open)).toBe(true);
  });
});

describe("FinalCta", () => {
  it("closes on the same primary CTA, with Show Interest as the fallback", () => {
    render(<FinalCta />);

    expect(screen.getByRole("link", { name: "Start Free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("button", { name: "Show Interest" })).toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("links only to sections that exist on the page", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "CoFounderAI" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "How It Works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "#benefits");
  });

  it("renders the unbuilt Company/Legal pages as disabled text, never as dead links", () => {
    render(<Footer />);

    for (const label of ["About", "Contact", "Blog", "Privacy", "Terms", "Security"]) {
      const item = screen.getByText(label);
      expect(item.tagName).toBe("SPAN");
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAttribute("title", "Coming soon");
    }
    expect(screen.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
  });
});
