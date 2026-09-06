import { Check } from "lucide-react";
import { LandingButton } from "./landing-button";
import { FadeIn } from "./fade-in";

const TIERS = [
  {
    name: "Free",
    tagline: "Explore CoFounderAI",
    features: ["Product onboarding", "Basic ICP", "Limited prospects", "Limited AI usage"],
    cta: "Start Free",
    href: "/signup",
    featured: false,
  },
  {
    name: "Founder",
    tagline: "Build your pipeline",
    features: [
      "Full prospect discovery",
      "Research",
      "Scoring",
      "Outreach generation",
      "Conversation intelligence",
      "Higher limits",
    ],
    cta: "Start Building",
    href: "/signup",
    featured: true,
  },
  {
    name: "Growth",
    tagline: "Scale customer acquisition",
    features: [
      "Higher usage",
      "Advanced research",
      "Team capabilities",
      "Advanced analytics",
      "Priority capabilities",
    ],
    cta: "Get Started",
    href: "/signup",
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Pricing
            </h2>
            <p className="mt-4 text-landing-muted">
              Final pricing is still being finalized — here&apos;s the shape it will take.
            </p>
          </div>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <FadeIn key={tier.name} delayMs={i * 100}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-8 ${
                  tier.featured
                    ? "border-landing-accent/40 bg-landing-accent/[0.06]"
                    : "border-landing-surface-border bg-landing-surface"
                }`}
              >
                <p className="font-medium text-landing-fg">{tier.name}</p>
                <p className="mt-1 text-sm text-landing-muted">{tier.tagline}</p>
                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-landing-muted">
                      <Check className="mt-0.5 size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <LandingButton
                  href={tier.href}
                  variant={tier.featured ? "primary" : "secondary"}
                  className="mt-8 w-full"
                >
                  {tier.cta}
                </LandingButton>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
