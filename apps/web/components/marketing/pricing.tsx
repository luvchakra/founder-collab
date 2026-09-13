import { Check } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { LandingButton } from "./landing-button";
import { FadeIn } from "./fade-in";

const TIERS = [
  {
    name: "Free",
    tagline: `Explore ${BRAND_NAME}`,
    features: ["One business, one module of your choice", "Core features of that module", "Limited AI usage", "Community support"],
    cta: "Start Free",
    href: "/signup",
    featured: false,
  },
  {
    name: "Per Module",
    tagline: "License exactly what you run",
    features: [
      "Discovery, Inventory, Service, CRM or Compliance",
      "Full features of every module you license",
      "Data shared automatically across licensed modules",
      "Cancel a module anytime -- 30-day read-only grace, data always kept",
    ],
    cta: "Start Building",
    href: "/signup",
    featured: true,
  },
  {
    name: "Full Platform",
    tagline: "All five modules, one business",
    features: [
      "Every module licensed together",
      "Team roles and permissions across modules",
      "Priority support",
      "Advanced usage limits",
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
              Pay for the modules you run, not a bundle you don&apos;t need. Final
              per-module pricing is still being finalized -- here&apos;s the shape it
              will take.
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
