import { Check, X } from "lucide-react";
import { FadeIn } from "./fade-in";

const ROWS: [string, string][] = [
  ["Generates emails", "Understands the prospect"],
  ["Uses generic templates", "Creates prospect-specific strategy"],
  ["Finds contacts", "Prioritizes the right contacts"],
  ["Sends messages", "Explains why to contact them"],
  ["Stops after sending", "Analyzes the response"],
  ["No context", "Learns from conversations"],
  ["Content assistant", "GTM co-founder"],
];

export function Differentiation() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <FadeIn>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Not another AI email generator.
            </h2>
            <p className="mt-4 text-lg text-landing-muted">
              CoFounderAI thinks about the entire customer acquisition journey.
            </p>
          </div>
        </FadeIn>

        <FadeIn delayMs={150}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-landing-surface-border">
            <div className="grid grid-cols-2 bg-landing-bg-elevated text-sm font-medium">
              <div className="px-6 py-4 text-landing-muted">Traditional AI Tool</div>
              <div className="border-l border-landing-surface-border px-6 py-4 text-landing-accent">
                CoFounderAI
              </div>
            </div>
            {ROWS.map(([before, after], i) => (
              <div
                key={before}
                className={`grid grid-cols-2 text-sm ${i % 2 === 0 ? "bg-landing-surface" : "bg-landing-bg-elevated/40"}`}
              >
                <div className="flex items-center gap-2 px-6 py-4 text-landing-muted">
                  <X className="size-4 shrink-0 text-landing-muted/70" aria-hidden="true" />
                  {before}
                </div>
                <div className="flex items-center gap-2 border-l border-landing-surface-border px-6 py-4 text-landing-fg">
                  <Check className="size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                  {after}
                </div>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delayMs={250}>
          <p className="mt-10 text-balance text-center text-xl font-medium text-landing-fg">
            The goal isn&apos;t more outreach. It&apos;s more meaningful conversations.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
