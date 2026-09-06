import { Target, Filter, Lightbulb, Clock, Send, Compass } from "lucide-react";
import { FadeIn } from "./fade-in";

const BENEFITS = [
  {
    icon: Target,
    title: "Know Your ICP",
    body: "Stop guessing who your ideal customer is.",
  },
  {
    icon: Filter,
    title: "Find Better Prospects",
    body: "Focus your time on accounts that actually fit.",
  },
  {
    icon: Lightbulb,
    title: "Know Why They Might Buy",
    body: "Understand the specific problem your product can solve for each prospect.",
  },
  {
    icon: Clock,
    title: "Know When to Reach Out",
    body: "Use buying signals and timing indicators to prioritize prospects.",
  },
  {
    icon: Send,
    title: "Send Better Outreach",
    body: "Create personalized messages based on the actual prospect rather than generic templates.",
  },
  {
    icon: Compass,
    title: "Always Know What To Do Next",
    body: "Turn replies into recommended actions.",
  },
];

export function Benefits() {
  return (
    <section id="benefits" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeIn>
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            A co-founder that never stops thinking about your next customer.
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, i) => (
            <FadeIn key={benefit.title} delayMs={i * 75}>
              <div className="h-full rounded-xl border border-landing-surface-border bg-landing-surface p-6">
                <benefit.icon className="size-5 text-landing-accent" aria-hidden="true" />
                <p className="mt-4 font-medium text-landing-fg">{benefit.title}</p>
                <p className="mt-2 text-sm text-landing-muted">{benefit.body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
