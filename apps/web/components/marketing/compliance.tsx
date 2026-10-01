import Link from "next/link";
import { CreditCard, FileLock2, ShieldCheck, UserLock } from "lucide-react";
import { FadeIn } from "./fade-in";

/**
 * Trust center: payments, data protection, financial controls and security
 * (docs/compliance/). Every claim here maps to a control that is actually implemented
 * and tested -- keep it that way. In particular, never say "certified" or "SOX
 * compliant": certification and SOX attestation are organizational processes code alone
 * can't deliver, so the copy says what the platform *does* ("SOX-style controls",
 * "GDPR & DPDP-ready") rather than what an auditor would have to sign.
 */
const STANDARDS = ["Razorpay", "Stripe", "GDPR", "DPDP Act 2023", "SOX-style controls", "Two-factor auth"];

const PILLARS = [
  {
    icon: CreditCard,
    title: "Payments, built in",
    tagline: "Razorpay and Stripe, ready to go.",
    points: [
      "UPI, cards, netbanking and UPI Autopay through Razorpay; global cards through Stripe",
      "Send customers a payment link and paid invoices reconcile themselves",
      "Money goes straight to your own gateway account, never through ours",
      "Card and bank details stay on Razorpay's and Stripe's own pages",
    ],
  },
  {
    icon: UserLock,
    title: "GDPR & DPDP-ready",
    tagline: "Privacy rights, handled for you and your customers.",
    points: [
      "Clear consent, recorded and versioned, and as easy to withdraw as to give",
      "One-click data download and account deletion",
      "Erase a customer's data everywhere with one action, with tax records kept where the law requires",
      "One-click unsubscribe on every email; opt-outs are honoured automatically",
    ],
  },
  {
    icon: FileLock2,
    title: "Audit-grade financial controls",
    tagline: "SOX-style controls for your books.",
    points: [
      "Tamper-evident audit trail: every change is recorded and integrity-checked",
      "Issued invoices are locked; corrections go through credit notes",
      "Close a period and its books stay closed. Reopening needs a separate permission and a reason",
      "Segregation of duties: the person who records a payment can't quietly void it",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Security by default",
    tagline: "The best practices, switched on.",
    points: [
      "Two-factor authentication, enforced on every sign-in once enabled",
      "Database-level isolation between businesses",
      "Encrypted API keys and gateway credentials, never exposed to the browser",
      "Strict browser security headers, signed webhooks and continuous dependency patching",
    ],
  },
];

export function Compliance() {
  return (
    <section id="trust-center" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Built for money. Built for audit. Built for trust.
            </h2>
            <p className="mt-4 text-balance text-landing-muted">
              Collect payments, protect your customers&apos; data and keep your books
              audit-ready from day one, with no add-ons and no extra tools.
            </p>
          </div>
        </FadeIn>

        <FadeIn delayMs={100}>
          <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Integrations and standards">
            {STANDARDS.map((standard) => (
              <li
                key={standard}
                className="rounded-full border border-landing-surface-border bg-landing-surface px-3 py-1 text-xs font-medium text-landing-fg"
              >
                {standard}
              </li>
            ))}
          </ul>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {PILLARS.map((pillar, i) => (
            <FadeIn key={pillar.title} delayMs={i * 75}>
              <div className="h-full rounded-2xl border border-landing-surface-border bg-landing-surface p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-landing-accent/15">
                    <pillar.icon className="size-5 text-landing-accent" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-landing-fg">{pillar.title}</h3>
                    <p className="text-sm text-landing-muted">{pillar.tagline}</p>
                  </div>
                </div>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-landing-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-landing-accent" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delayMs={150}>
          <p className="mx-auto mt-10 max-w-3xl text-balance text-center text-xs text-landing-muted">
            CoFounderAI gives you the controls; certifications and audits remain your organization&apos;s
            to complete. Read our{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-landing-fg">
              privacy notice
            </Link>
            .
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
