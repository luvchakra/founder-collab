import Image from "next/image";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LandingButton } from "./landing-button";
import { ShowInterestCta } from "./show-interest";
import { FadeIn } from "./fade-in";

export function Hero() {
  return (
    <section id="product" className="relative overflow-hidden px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      <div className="landing-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
        <FadeIn>
          <p className="text-xs font-semibold tracking-[0.2em] text-landing-accent uppercase">
            Accelerate. Revenue. Knowledge.
          </p>
          <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-landing-fg sm:text-6xl">
            One login. Five business tools. Zero duplicate data.
          </h1>
        </FadeIn>
        <FadeIn delayMs={100}>
          <p className="mt-6 max-w-2xl text-balance text-lg text-landing-muted">
            {BRAND_NAME} replaces the pile of disconnected apps a growing business ends up
            with — customer discovery, inventory, field service, a shared inbox, and GST
            compliance — with one portal where every module already knows your customers,
            your items, and your team.
          </p>
        </FadeIn>
        <FadeIn delayMs={200}>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <LandingButton href="/signup" size="lg">
              Start Free
            </LandingButton>
            <LandingButton href="#modules" variant="secondary" size="lg">
              Explore the Modules
            </LandingButton>
          </div>
        </FadeIn>
        <FadeIn delayMs={300}>
          <p className="mt-6 text-sm text-landing-muted">
            License only the modules you need today.
            <br />
            Add more later — your data is already connected.
          </p>
          <ShowInterestCta className="mt-4" />
        </FadeIn>
      </div>

      <FadeIn delayMs={350} className="relative mx-auto mt-16 max-w-5xl">
        <div className="landing-glow overflow-hidden rounded-2xl">
          <Image
            src="/screens/business-overview.png"
            alt={`${BRAND_NAME} dashboard showing active jobs, open opportunities, low stock alerts and open support tickets in one view`}
            width={1620}
            height={764}
            priority
            className="h-auto w-full"
          />
        </div>
      </FadeIn>
    </section>
  );
}
