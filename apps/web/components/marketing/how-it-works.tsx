import type { ReactNode } from "react";
import { FadeIn } from "./fade-in";

function StepShell({
  index,
  title,
  body,
  children,
}: {
  index: number;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <FadeIn>
      <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-landing-surface-border bg-landing-surface p-8 lg:grid-cols-2">
        <div>
          <span className="text-sm font-semibold text-landing-accent">Step {index}</span>
          <h3 className="mt-2 text-2xl font-semibold text-landing-fg">{title}</h3>
          <p className="mt-3 text-landing-muted">{body}</p>
        </div>
        {children}
      </div>
    </FadeIn>
  );
}

function OutputList({ items }: { items: string[] }) {
  return (
    <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5">
      <ul className="flex flex-col gap-2.5 text-sm text-landing-muted">
        {items.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-landing-accent" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <FadeIn>
          <h2 className="text-center text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
            How CoFounderAI Works
          </h2>
        </FadeIn>

        <div className="mt-14 flex flex-col gap-6">
          <StepShell
            index={1}
            title="Tell Us About Your Product"
            body="Describe what you've built, who it's for, and what problem it solves."
          >
            <OutputList
              items={["Product understanding", "Value proposition", "ICP hypotheses", "Key use cases"]}
            />
          </StepShell>

          <StepShell
            index={2}
            title="Discover Your Customers"
            body="CoFounderAI researches the market and finds companies that match your ideal customer profile."
          >
            <OutputList
              items={["Target companies", "Relevant contacts", "ICP fit", "Company information", "Buying signals"]}
            />
          </StepShell>

          <StepShell
            index={3}
            title="Understand Each Prospect"
            body="AI researches each prospect and figures out why they may care."
          >
            <OutputList
              items={[
                "Why them?",
                "Why now?",
                "Who should I contact?",
                "What should I say?",
                "Which channel should I use?",
              ]}
            />
          </StepShell>

          <StepShell
            index={4}
            title="Approve & Reach Out"
            body="CoFounderAI creates personalized outreach. You review it before anything is sent."
          >
            <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5 text-sm">
              <div className="flex justify-between text-landing-muted">
                <span>Recommended approach</span>
                <span className="text-landing-fg">Email</span>
              </div>
              <div className="mt-2 flex justify-between text-landing-muted">
                <span>Opening angle</span>
                <span className="text-landing-fg">Recent product launch</span>
              </div>
              <div className="mt-2 flex justify-between text-landing-muted">
                <span>CTA</span>
                <span className="text-landing-fg">15-minute discovery conversation</span>
              </div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-full bg-landing-accent px-4 py-1.5 text-xs font-medium text-landing-accent-foreground">
                  Approve
                </span>
                <span className="rounded-full border border-landing-surface-border px-4 py-1.5 text-xs font-medium text-landing-fg">
                  Edit
                </span>
              </div>
            </div>
          </StepShell>

          <StepShell
            index={5}
            title="Let AI Help With the Conversation"
            body="When the prospect responds, CoFounderAI analyzes sentiment, intent, conversation stage, objections, and buying signals -- then recommends the next best action."
          >
            <div className="rounded-xl border border-landing-surface-border bg-landing-bg-elevated p-5 text-sm">
              <p className="text-landing-muted">
                Prospect is interested but concerned about implementation effort.
              </p>
              <p className="mt-3 font-medium text-landing-accent">Next best action</p>
              <p className="mt-1 text-landing-fg">
                &ldquo;Send a short implementation overview and offer a 15-minute
                technical discussion.&rdquo;
              </p>
            </div>
          </StepShell>
        </div>
      </div>
    </section>
  );
}
