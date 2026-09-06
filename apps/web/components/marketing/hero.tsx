import { ArrowRight } from "lucide-react";
import { LandingButton } from "./landing-button";
import { ShowInterestCta } from "./show-interest";
import { FadeIn } from "./fade-in";

export function Hero() {
  return (
    <section id="product" className="relative overflow-hidden px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      <div className="landing-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
        <FadeIn>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-landing-fg sm:text-6xl">
            Your AI Co-Founder for Getting Customers.
          </h1>
        </FadeIn>
        <FadeIn delayMs={100}>
          <p className="mt-6 max-w-2xl text-balance text-lg text-landing-muted">
            You built the product. CoFounderAI helps you find the right customers,
            understand why they might buy, and turn conversations into opportunities.
          </p>
        </FadeIn>
        <FadeIn delayMs={200}>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <LandingButton href="/signup" size="lg">
              Start Free
            </LandingButton>
            <LandingButton href="#how-it-works" variant="secondary" size="lg">
              See How It Works
            </LandingButton>
          </div>
        </FadeIn>
        <FadeIn delayMs={300}>
          <p className="mt-6 text-sm text-landing-muted">
            No sales team required.
            <br />
            You stay in control. AI does the heavy lifting.
          </p>
          <ShowInterestCta className="mt-4" />
        </FadeIn>
      </div>

      <FadeIn delayMs={350} className="relative mx-auto mt-16 max-w-4xl">
        <HeroProductVisual />
      </FadeIn>
    </section>
  );
}

function HeroProductVisual() {
  return (
    <div className="landing-glow rounded-2xl border border-landing-surface-border bg-landing-bg-elevated p-4 sm:p-6">
      <div className="rounded-xl border border-landing-surface-border bg-landing-surface p-6">
        <p className="text-lg font-medium text-landing-fg">Good morning, Founder 👋</p>
        <p className="mt-1 text-landing-muted">Your GTM plan is ready.</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["127", "potential customers identified"],
            ["23", "high-fit prospects"],
            ["8", "buying signals detected"],
            ["5", "prospects ready for outreach"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="rounded-lg border border-landing-surface-border bg-landing-bg-elevated p-4 text-left"
            >
              <dt className="text-2xl font-semibold text-landing-accent">{value}</dt>
              <dd className="mt-1 text-xs text-landing-muted">{label}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 rounded-lg border border-landing-surface-border bg-landing-bg-elevated p-5 text-left">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-landing-fg">Acme Technologies</p>
            <span className="rounded-full bg-landing-accent/15 px-2.5 py-0.5 text-xs font-medium text-landing-accent">
              ICP Fit: 94%
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-landing-muted">
            <span>
              Intent: <span className="text-landing-fg">High</span>
            </span>
            <span>
              Timing: <span className="text-landing-fg">Excellent</span>
            </span>
            <span>
              Recommended Contact: <span className="text-landing-fg">VP Product</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-landing-muted">
            <span className="font-medium text-landing-fg">Why now? </span>
            &ldquo;Acme recently launched a product requiring automated identity
            management.&rdquo;
          </p>
          <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-landing-accent">
            View Strategy <ArrowRight className="size-4" aria-hidden="true" />
          </p>
        </div>
      </div>
    </div>
  );
}
