import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

const FAQS: [string, string][] = [
  [
    `What exactly is ${BRAND_NAME}?`,
    `${BRAND_NAME} is one portal, one login, five independently licensed modules: Discovery (customer discovery and outreach), Inventory (products and purchasing), Service (field service and jobs), CRM (a unified inbox) and Compliance (GST). Every module shares the same underlying customer, item and document data.`,
  ],
  [
    "Do I have to buy all five modules?",
    "No. License only the modules your business needs today, and add more later. A module you haven't licensed simply doesn't appear -- other modules keep working normally.",
  ],
  [
    "If I license a second module later, do I have to re-enter my data?",
    "No. A newly licensed module reads the same customers, items and documents your existing modules already created -- there's nothing to import.",
  ],
  [
    "What happens to my data if I cancel a module?",
    "Nothing is deleted. You get 30 days of read-only access to that module's data, then access is paused (not erased) until you reactivate -- reactivating restores everything.",
  ],
  [
    "Is Discovery's AI going to send messages on its own?",
    "No. Discovery's AI researches accounts, scores them, and drafts outreach -- you review and approve before anything is sent.",
  ],
  [
    "Can I use my own AI provider?",
    "Yes, for Discovery. Connect a supported AI provider using your own API key; you choose the provider, and it internally selects the right model per task.",
  ],
  [
    "Is my business's data isolated from other businesses?",
    `Yes. Every table in every module enforces tenant isolation at the database layer -- your data is scoped to your business and to the modules you've licensed, never a client-side filter.`,
  ],
  [
    "Can one account run more than one business?",
    "Yes. One login can belong to multiple businesses, each with its own independent set of licensed modules and data.",
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
