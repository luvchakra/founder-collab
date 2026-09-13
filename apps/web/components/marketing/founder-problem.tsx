import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

const PROBLEMS = [
  {
    question: "Who's actually a customer?",
    body: "Your CRM calls them a lead, your invoicing tool calls them a customer, and your field service app has yet another record for the same person -- three profiles, no single source of truth.",
  },
  {
    question: "Did we bill for the parts we used?",
    body: "A technician uses parts on a job in one system; the invoice gets written in another. Nothing forces the two to agree, so margin quietly leaks.",
  },
  {
    question: "Which tool has the real inventory count?",
    body: "Stock gets sold on one screen and consumed on a job in another. By the time anyone reconciles them, a customer has already been promised something you don't have.",
  },
  {
    question: "Who's supposed to reply to this?",
    body: "A WhatsApp message, an email, and a support ticket about the same issue land in three inboxes -- each with only part of the conversation.",
  },
  {
    question: "Are we actually GST-compliant?",
    body: `Filing deadlines and e-invoicing rules live in a spreadsheet somewhere, disconnected from the sales data they're supposed to be filed against.`,
  },
  {
    question: "What happens when we add a sixth tool?",
    body: `Another login, another export/import routine, another place customer data can drift out of sync -- ${BRAND_NAME} is the alternative to adding a sixth tool.`,
  },
];

export function FounderProblem() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            Growing past spreadsheets means adding tools. Adding tools means losing the
            single picture of your business.
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((problem, i) => (
            <FadeIn key={problem.question} delayMs={i * 75}>
              <div className="h-full rounded-xl border border-landing-surface-border bg-landing-surface p-6">
                <p className="font-medium text-landing-fg">{problem.question}</p>
                <p className="mt-2 text-sm text-landing-muted">{problem.body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
