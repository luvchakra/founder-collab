import { Check, Sparkles } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { cn } from "@cofounderai/core/lib/utils";

type Tier = {
  key: "free" | "pro" | "max" | "enterprise";
  name: string;
  price: string;
  priceDetail?: string;
  tagline: string;
  features: string[];
  cta: string;
  href?: string;
  highlighted?: boolean;
};

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "₹0",
    priceDetail: "forever",
    tagline: "Everything you need to get a GTM motion running.",
    features: [
      "1 business",
      "5 products",
      "5 AI credits per day",
      "Basic CRM",
      "No GST",
    ],
    cta: "Current plan",
  },
  {
    key: "pro",
    name: "Pro",
    price: "Coming soon",
    tagline: "For a founder who's outgrown the free allowance.",
    features: [
      "3 businesses",
      "50 products",
      "10 AI credits per day",
      "Advanced CRM",
      "Basic GST",
    ],
    cta: "Notify me",
    highlighted: true,
  },
  {
    key: "max",
    name: "Max",
    price: "Coming soon",
    tagline: "For a team running every module at once.",
    features: [
      "10 businesses",
      "100 products",
      "20 AI credits per day",
      "Advanced CRM",
      "Advanced GST",
    ],
    cta: "Notify me",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    tagline: "Custom credit pools, SSO, and SLAs for larger teams.",
    features: [
      "Custom AI-credit pool sized to your usage",
      "Custom module bundle & seat pricing",
      "SSO and a dedicated support channel",
    ],
    cta: "Contact us",
    // Placeholder -- there's no real sales inbox wired up on this deployment yet; swap
    // for the team's actual address before this ships anywhere founders will click it.
    href: "mailto:sales@cofounderai.app?subject=Enterprise%20plan",
  },
];

function TierCard({ tier }: { tier: Tier }) {
  const isFree = tier.key === "free";
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4",
        tier.highlighted ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{tier.name}</h3>
        {isFree ? <Badge variant="secondary">Current plan</Badge> : null}
        {tier.highlighted ? <Badge className="gap-1"><Sparkles className="size-3" aria-hidden="true" />Popular</Badge> : null}
      </div>
      <div>
        <span className="text-2xl font-semibold">{tier.price}</span>
        {tier.priceDetail ? <span className="ml-1 text-sm text-muted-foreground">{tier.priceDetail}</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">{tier.tagline}</p>
      <ul className="flex flex-1 flex-col gap-2 text-sm">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
      {isFree ? (
        <Button size="sm" variant="outline" disabled className="w-full">
          {tier.cta}
        </Button>
      ) : tier.href ? (
        <Button asChild size="sm" variant={tier.highlighted ? "default" : "outline"} className="w-full">
          <a href={tier.href}>{tier.cta}</a>
        </Button>
      ) : (
        <Button size="sm" variant={tier.highlighted ? "default" : "outline"} disabled className="w-full">
          {tier.cta}
        </Button>
      )}
    </div>
  );
}

/**
 * "Founder Mode" -- the platform's plan tiers (Free/Pro/Max/Enterprise), shown for
 * comparison even though only Free is actually purchasable today (blueprint §22: MVP is
 * free-tier only, confirmed by the Billing page's own pre-existing copy). Pro/Max are
 * "Notify me" rather than a live checkout -- same honesty rule this page already applies
 * to AI credits (packages/core/src/billing/) when Razorpay isn't configured: never show a
 * button that looks like it works but doesn't. The business/product caps and AI-credit
 * allowances and CRM/GST tiers listed per plan are display-only for now, same as Pro/Max
 * themselves -- none of them are backend-enforced yet (the Free tier's actual current
 * limits, still in effect regardless of what's shown here, are
 * packages/module-discovery/src/lib/usage/limits.ts's per-workspace monthly cap; every
 * module stays individually licensed via core.licenses no matter what plan an account is
 * on). Wiring real enforcement to these numbers is a separate, larger piece of work.
 */
export function PricingTiers() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Founder Mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare what each plan includes below.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <TierCard key={tier.key} tier={tier} />
        ))}
      </div>
    </div>
  );
}
