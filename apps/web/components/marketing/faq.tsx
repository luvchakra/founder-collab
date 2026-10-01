import { FadeIn } from "./fade-in";

const FAQS: [string, string][] = [
  [
    "What exactly does CoFounderAI do?",
    "CoFounderAI helps founders identify ideal customers, discover prospects, research them, create personalized outreach, analyze conversations, and decide what to do next.",
  ],
  [
    "Is this an email automation tool?",
    "No. CoFounderAI is designed as a complete customer-acquisition intelligence layer rather than simply an email sender.",
  ],
  [
    "Does CoFounderAI send messages automatically?",
    "Initially, no. The founder reviews and approves outreach before it is sent.",
  ],
  [
    "Do I need a sales team?",
    "No. CoFounderAI is designed specifically to help founders perform GTM activities themselves.",
  ],
  [
    "Can I use my own AI provider?",
    "Yes. You can connect a supported AI provider using your own API key.",
  ],
  [
    "Can I choose the AI model?",
    "No model selection is required. You choose the provider, while CoFounderAI internally selects the appropriate model for each operation.",
  ],
  [
    "Can I manage multiple products?",
    "Yes. Each product has its own GTM workspace and customer-acquisition context.",
  ],
  [
    "Is my product data isolated from other businesses?",
    "Yes. Product/GTM workspaces are isolated through the application's tenancy and database security model.",
  ],
  [
    "Which payment methods are supported?",
    "Razorpay (UPI, UPI Autopay, cards, netbanking) and Stripe (cards worldwide), both for paying for CoFounderAI and for collecting from your own customers through payment links. Money goes straight to your own gateway account, and card and bank details are only ever entered on Razorpay's or Stripe's own pages.",
  ],
  [
    "Is CoFounderAI GDPR and DPDP compliant?",
    "CoFounderAI gives you what both laws require of a platform: a clear privacy notice, recorded and withdrawable consent, self-service data download and deletion, a register for your customers' privacy requests with 30-day deadlines, erasure across every module, one-click unsubscribe and automatic data retention. Your organization still owns its own obligations, such as appointing a grievance officer.",
  ],
  [
    "Can my auditors rely on the books?",
    "The platform enforces SOX-style controls: a tamper-evident audit trail, locked invoices once issued, period close, void-instead-of-delete payments and segregation of duties. These are the technical controls an audit looks for. The audit and any attestation itself is done by your auditors.",
  ],
  [
    "How is my account secured?",
    "Two-factor authentication, database-level isolation between businesses, encrypted credentials, strict browser security headers, signed payment webhooks and continuous dependency patching.",
  ],
];

export function Faq() {
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            Frequently asked questions
          </h2>
        </FadeIn>

        <FadeIn delayMs={100}>
          <div className="mt-12 flex flex-col divide-y divide-landing-surface-border rounded-2xl border border-landing-surface-border bg-landing-surface">
            {FAQS.map(([question, answer]) => (
              <details key={question} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-landing-fg">
                  {question}
                  <span
                    className="shrink-0 text-landing-muted transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-landing-muted">{answer}</p>
              </details>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
