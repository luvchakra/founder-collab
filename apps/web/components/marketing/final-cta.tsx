import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LandingButton } from "./landing-button";
import { ShowInterestCta } from "./show-interest";
import { FadeIn } from "./fade-in";

export function FinalCta() {
  return (
    <section className="px-6 py-24">
      <FadeIn>
        <div className="landing-glow mx-auto max-w-3xl rounded-2xl border border-landing-surface-border bg-landing-bg-elevated px-8 py-16 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            Stop reconciling five tools. Run your business from one.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-landing-muted">
            Start with the one module you need most. {BRAND_NAME} is ready the moment
            you license the next one.
          </p>
          <div className="mt-8">
            <LandingButton href="/signup" size="lg">
              Start Free
            </LandingButton>
          </div>
          <p className="mt-4 text-sm text-landing-muted">
            Takes only a few minutes to get started.
          </p>
          <ShowInterestCta className="mt-4" />
        </div>
      </FadeIn>
    </section>
  );
}
