// @vitest-environment jsdom
/**
 * The landing page's single CTA style. What matters is that the variants stay visually
 * distinct (design principle 4: a secondary action must never look like Start Free) and
 * that the class recipe is shared rather than copied — the Show Interest modal's submit
 * button renders the same classes through landingButtonVariants without being a Link.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LandingButton, landingButtonVariants } from "./landing-button";

afterEach(cleanup);

describe("landingButtonVariants", () => {
  it("defaults to the primary accent at the default size", () => {
    const classes = landingButtonVariants();
    expect(classes).toContain("bg-landing-accent");
    expect(classes).toContain("px-5");
  });

  it("gives secondary and ghost their own, non-primary treatments", () => {
    expect(landingButtonVariants({ variant: "secondary" })).not.toContain("bg-landing-accent ");
    expect(landingButtonVariants({ variant: "secondary" })).toContain("bg-landing-surface");
    expect(landingButtonVariants({ variant: "ghost" })).toContain("text-landing-fg");
    expect(landingButtonVariants({ variant: "ghost" })).not.toContain("border");
  });

  it("scales up for the hero-sized CTA", () => {
    expect(landingButtonVariants({ size: "lg" })).toContain("px-7");
  });
});

describe("LandingButton", () => {
  it("renders a link to its href", () => {
    render(<LandingButton href="/signup">Start Free</LandingButton>);

    expect(screen.getByRole("link", { name: "Start Free" })).toHaveAttribute("href", "/signup");
  });

  it("carries the variant classes and any caller classes", () => {
    render(
      <LandingButton href="/demo" variant="secondary" size="lg" className="w-full">
        See How It Works
      </LandingButton>,
    );

    const link = screen.getByRole("link", { name: "See How It Works" });
    expect(link).toHaveClass("bg-landing-surface", "px-7", "w-full");
  });

  it("forwards the rest of Link's props", () => {
    render(
      <LandingButton href="/signup" prefetch={false} aria-describedby="cta-note">
        Start Free
      </LandingButton>,
    );

    expect(screen.getByRole("link", { name: "Start Free" })).toHaveAttribute(
      "aria-describedby",
      "cta-note",
    );
  });
});
