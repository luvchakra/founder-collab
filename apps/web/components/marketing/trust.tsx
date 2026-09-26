import {
  ShieldCheck,
  KeyRound,
  Lock,
  Eye,
  FileCheck2,
  Database,
  UserCheck,
  ShieldAlert,
  Globe2,
  Sparkles,
  Users,
} from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { FadeIn } from "./fade-in";

const AI_CONTROL_FLOW = ["AI Researches", "AI Recommends", "You Review", "You Approve", "AI Learns"];

const PROVIDERS = ["OpenAI", "Anthropic", "Google"];

const CHAT_POINTS = [
  "Pulls live data from every module you've licensed in one query, on request",
  "Answers are grounded in your real records -- not a guess",
  "Suggests what to do next, not just a number",
];

const SECURITY_POINTS = [
  { icon: Lock, label: "Secure authentication" },
  { icon: Database, label: "Row-level tenant isolation, per business" },
  { icon: ShieldCheck, label: "A module's data is only visible while it's licensed" },
  { icon: KeyRound, label: "Encrypted provider credentials" },
  { icon: Eye, label: "No API keys exposed in the browser" },
  { icon: UserCheck, label: "You approve AI-generated outreach before it sends" },
  { icon: FileCheck2, label: "Full audit trail across every module" },
  { icon: Users, label: "Role-based access for every team member, enforced in the database" },
  { icon: ShieldAlert, label: "Data encrypted in transit and at rest" },
  { icon: Globe2, label: "Built for multi-jurisdiction tax regulation" },
];

/** Practices, not third-party certifications this platform doesn't hold -- every phrase
 * here is either an architectural fact already true today (RLS tenant isolation, the
 * 30-day retention grace, GST as a shipped module) or an honest "-aligned"/"-ready"
 * description of a security posture, never a claimed audit or certification badge we
 * can't back up. */
const COMPLIANCE_BADGES = [
  "GST-ready tax compliance",
  "GDPR-aligned data handling",
  "SOC 2-aligned security practices",
  "Full audit trail, every module",
];

export function Trust() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto flex max-w-6xl flex-col gap-24">
        {/* Founder-controlled AI */}
        <FadeIn>
          <div className="rounded-2xl border border-landing-surface-border bg-landing-surface p-8 sm:p-12">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              AI does the research. You make the decisions.
            </h2>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-2">
              {AI_CONTROL_FLOW.map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-landing-surface-border bg-landing-bg-elevated px-4 py-2 text-sm text-landing-fg">
                    {step}
                  </span>
                  {i < AI_CONTROL_FLOW.length - 1 ? (
                    <span className="text-landing-muted" aria-hidden="true">
                      <span className="sm:hidden">↓</span>
                      <span className="hidden sm:inline">→</span>
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="mx-auto mt-10 max-w-xl text-balance text-center text-landing-muted">
              Discovery&apos;s AI finds and scores accounts and drafts outreach --{" "}
              {BRAND_NAME} never sends anything on its own. Every other module runs on
              deterministic rules, not AI guesses, for the things that shouldn&apos;t be
              probabilistic: stock counts, invoices, and GST filings.
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
                Choose your preferred AI provider and securely connect your own API key.{" "}
                {BRAND_NAME} selects the appropriate model internally for each Discovery
                task. Don&apos;t have a key yet? {BRAND_NAME} can run on its own built-in
                AI provider instead, so you&apos;re never blocked -- connect your own
                anytime to take full control.
              </p>
              <p className="mt-4 font-medium text-landing-fg">
                Your key, or ours. {BRAND_NAME} handles the intelligence layer either way.
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

        {/* Cross-module AI chat */}
        <FadeIn>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
                One chat, every module&apos;s data.
              </h2>
              <p className="mt-4 text-landing-muted">
                Ask the built-in AI assistant a question and it can pull live data from
                every module you&apos;ve licensed -- Discovery, Inventory, Service, CRM
                and Finance -- to answer it and suggest what to do next.
              </p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {CHAT_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-landing-fg">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-landing-accent" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-landing-surface-border bg-landing-surface p-5">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-landing-accent px-4 py-2.5 text-sm text-landing-accent-foreground">
                  Which customers are we most at risk of losing this month?
                </p>
              </div>
              <div className="mt-3 flex justify-start">
                <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-landing-bg-elevated px-4 py-2.5 text-sm text-landing-fg">
                  3 accounts: Whitfield Residence has a service visit 12 days overdue,
                  Ridgeview HOA hasn&apos;t replied in CRM since their quote request, and
                  Alvarez Household&apos;s last invoice is unpaid. Want me to draft a
                  follow-up for each?
                </p>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Security, privacy & compliance */}
        <FadeIn>
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-landing-fg sm:text-4xl">
              Security, privacy and compliance -- built in, not bolted on.
            </h2>
            <p className="mt-4 max-w-2xl text-landing-muted">
              Every table in every module enforces the same rule at the database layer:
              your data, only for a business you belong to, only while that module is
              licensed. Cancel a module and its data is kept, read-only, for 30 days --
              never deleted outright. Tax and regulatory rules are handled the same
              deterministic way, not left to guesswork.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {COMPLIANCE_BADGES.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-landing-surface-border bg-landing-bg-elevated px-4 py-1.5 text-xs font-medium text-landing-fg"
                >
                  {badge}
                </span>
              ))}
            </div>
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
