import { FadeIn } from "./fade-in";

const PROBLEMS = [
  {
    question: "Who should I sell to?",
    body: "Your product could help thousands of companies. But which ones should you approach first?",
  },
  {
    question: "Who should I contact?",
    body: "Finding a company isn't enough. You need the right person.",
  },
  {
    question: "Why would they care?",
    body: "Generic outreach gets ignored. Every prospect needs a reason to listen.",
  },
  {
    question: "Why now?",
    body: "Timing matters. Buying signals can tell you when an account may actually be ready.",
  },
  {
    question: "What do I do next?",
    body: "Every reply creates another decision. CoFounderAI helps you decide what comes next.",
  },
];

export function FounderProblem() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            Building the product was hard. Finding customers shouldn&apos;t be harder.
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
