import { ShieldCheck, KeyRound, Lock, Eye, FileCheck2, Database, UserCheck } from "lucide-react";
import { FadeIn } from "./fade-in";

const FOUNDER_CONTROL_FLOW = ["AI Researches", "AI Recommends", "Founder Reviews", "Founder Approves", "AI Learns"];

const PROVIDERS = ["OpenAI", "Anthropic", "Google"];

const SECURITY_POINTS = [
  { icon: Lock, label: "Secure authentication" },
  { icon: Database, label: "Workspace-level data isolation" },
  { icon: KeyRound, label: "Encrypted provider credentials" },
  { icon: Eye, label: "No API keys exposed in the browser" },
  { icon: UserCheck, label: "Founder approval before outreach" },
  { icon: ShieldCheck, label: "Secure data storage" },
  { icon: FileCheck2, label: "Auditability" },
];

export function Trust() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto flex max-w-6xl flex-col gap-24">
        {/* Founder-controlled AI */}
        <FadeIn>
          <div className="rounded-2xl border border-landing-surface-border bg-landing-surface p-8 sm:p-12">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              AI does the thinking. You make the decisions.
            </h2>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-2">
              {FOUNDER_CONTROL_FLOW.map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-landing-surface-border bg-landing-bg-elevated px-4 py-2 text-sm text-landing-fg">
                    {step}
                  </span>
                  {i < FOUNDER_CONTROL_FLOW.length - 1 ? (
                    <span className="text-landing-muted sm:rotate-0" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="mx-auto mt-10 max-w-xl text-balance text-center text-landing-muted">
              CoFounderAI is designed to work with you — not replace your judgment.
            </p>
          </div>
        </FadeIn>

        {/* AI provider / BYOK */}
        <FadeIn>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
                Bring the AI provider you trust.
              </h2>
              <p className="mt-4 text-landing-muted">
                Choose your preferred AI provider and securely connect your API key.
                CoFounderAI selects the appropriate model internally for each task.
              </p>
              <p className="mt-4 font-medium text-landing-fg">
                You choose the provider. CoFounderAI handles the intelligence layer.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {PROVIDERS.map((provider) => (
                <div
                  key={provider}
                  className="flex items-center justify-center rounded-xl border border-landing-surface-border bg-landing-surface py-8 text-sm font-medium text-landing-fg"
                >
                  {provider}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Security & privacy */}
        <FadeIn>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Your business data stays yours.
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY_POINTS.map((point) => (
                <div
                  key={point.label}
                  className="flex items-center gap-3 rounded-xl border border-landing-surface-border bg-landing-surface px-5 py-4 text-sm text-landing-fg"
                >
                  <point.icon className="size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                  {point.label}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
