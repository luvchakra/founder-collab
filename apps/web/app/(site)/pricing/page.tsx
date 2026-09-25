import type { Metadata } from "next";
import Link from "next/link";
import { Check, Mail } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { listPublicPlans, type PublicPlan } from "@cofounderai/core/admin/platform-plans";
import { CREDIT_PLANS } from "@cofounderai/core/billing/plans";
import { FREE_TIER_MONTHLY_RUN_LIMIT } from "@cofounderai/module-discovery/lib/usage/limits";
import { LandingButton } from "@/components/marketing/landing-button";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${BRAND_NAME} plans and AI usage — start free, license the modules you run.`,
  alternates: { canonical: "/pricing" },
};

// The plan catalogue is edited by a superadmin on /platform/plans, so this page is
// prerendered and refreshed every five minutes (same as the login page's branding) rather
// than rendered per request -- a price change shows up within five minutes, and the page
// itself comes off the CDN.
export const revalidate = 300;

/** Things every plan includes because of how the platform is built (ADR-4/ADR-9), not
 * because of any plan setting -- so they are true whatever a superadmin configures. */
const EVERY_PLAN = [
  "One login for every module your business licenses",
  "Your business's data isolated from every other business at the database level",
  "Team members with roles and permissions",
  "Cancel a module any time: 30 days read-only, then paused — your data is never deleted",
  "Email support",
];

function formatPrice(plan: PublicPlan): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    maximumFractionDigits: plan.price % 1 === 0 ? 0 : 2,
  }).format(plan.price);
}

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);

const talkToUs = (plan: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} ${plan} plan`)}`;

/**
 * Public pricing. Plans come from the platform's own catalogue (`platform.plans`, only the
 * ones a superadmin marked active and visible on the marketing site) so this page can
 * never quote a price the admin portal doesn't. AI usage comes from the constants the
 * product actually enforces: the monthly allowance in module-discovery's usage limits and
 * the credit packs in core/billing/plans.ts.
 *
 * Paid plans say "Talk to us" rather than "Buy": there is no self-serve subscription
 * checkout yet, and a button that implies one would be a promise the product can't keep.
 */
export default async function PricingPage() {
  const plans = await listPublicPlans();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-12 sm:px-8 sm:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">Pricing</h1>
        <p className="mt-4 text-landing-muted">
          Start free, then license the modules your business runs. Prices are in Indian Rupees and exclude
          GST, which is added where applicable.
        </p>
      </header>

      {plans.length > 0 ? (
        <section aria-label="Plans" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const free = plan.price === 0;
            const featured = plans.length > 2 && index === 1;
            return (
              <div
                key={plan.key}
                className={`flex h-full flex-col rounded-2xl border p-8 ${
                  featured
                    ? "border-landing-accent/40 bg-landing-accent/[0.06]"
                    : "border-landing-surface-border bg-landing-surface"
                }`}
              >
                <h2 className="font-medium text-landing-fg">{plan.name}</h2>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight text-landing-fg">
                    {free ? "Free" : formatPrice(plan)}
                  </span>
                  {free ? null : (
                    <span className="text-sm text-landing-muted">/ {plan.billingInterval === "year" ? "year" : "month"}</span>
                  )}
                </p>
                {plan.description ? <p className="mt-3 flex-1 text-sm text-landing-muted">{plan.description}</p> : <div className="flex-1" />}
                <LandingButton
                  href={free ? "/signup" : talkToUs(plan.name)}
                  variant={featured ? "primary" : "secondary"}
                  className="mt-8 w-full"
                >
                  {free ? "Start free" : "Talk to us"}
                </LandingButton>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="mx-auto w-full max-w-xl rounded-2xl border border-landing-surface-border bg-landing-surface p-8 text-center">
          <h2 className="font-medium text-landing-fg">Plans are being updated</h2>
          <p className="mt-2 text-sm text-landing-muted">
            You can start free today. For paid plans, email us and we&apos;ll get you set up.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <LandingButton href="/signup">Start free</LandingButton>
            <LandingButton href={talkToUs("paid")} variant="secondary">
              Email us
            </LandingButton>
          </div>
        </section>
      )}

      <section aria-labelledby="every-plan" className="rounded-2xl border border-landing-surface-border bg-landing-surface p-8">
        <h2 id="every-plan" className="text-lg font-semibold text-landing-fg">
          Every plan includes
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {EVERY_PLAN.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-landing-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-landing-accent" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-usage" className="flex flex-col gap-6">
        <div>
          <h2 id="ai-usage" className="text-lg font-semibold text-landing-fg">
            AI usage
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-landing-muted">
            AI features — drafting, research, strategy and replies — are counted in runs. Each Discovery offering
            includes up to {FREE_TIER_MONTHLY_RUN_LIMIT} AI runs a month. Need more? Add a credit pack; purchased runs
            stay on your account until you use them. You can also connect your own OpenAI, Anthropic or Google API key,
            in which case your provider bills you for its usage.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CREDIT_PLANS.map((pack) => (
            <div key={pack.key} className="rounded-xl border border-landing-surface-border bg-landing-surface p-5">
              <p className="text-sm font-medium text-landing-fg">{pack.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-landing-fg">{inr(pack.amount_inr_paise)}</p>
              <p className="mt-1 text-sm text-landing-muted">{pack.credited_runs.toLocaleString("en-IN")} AI runs</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-landing-muted">
          Credit packs are bought from Settings → Billing once you&apos;re signed in.
        </p>
      </section>

      <section className="flex flex-col items-center gap-4 rounded-2xl border border-landing-surface-border bg-landing-surface p-8 text-center">
        <h2 className="text-lg font-semibold text-landing-fg">Questions about plans?</h2>
        <p className="max-w-xl text-sm text-landing-muted">
          Tell us which modules you need and how big your team is, and we&apos;ll help you pick. See also our{" "}
          <Link href="/terms#fees" className="text-landing-accent underline-offset-4 hover:underline">
            billing terms
          </Link>
          .
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-landing-surface-border px-4 py-2 text-sm font-medium text-landing-fg transition-colors hover:border-landing-accent hover:text-landing-accent"
        >
          <Mail className="size-4" aria-hidden="true" />
          {CONTACT_EMAIL}
        </a>
      </section>
    </main>
  );
}
