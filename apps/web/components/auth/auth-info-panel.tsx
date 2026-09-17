import { Target, Boxes, CalendarClock, MessagesSquare, ShieldCheck, Sparkles } from "lucide-react";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";

const MODULE_HIGHLIGHTS = [
  { icon: Target, label: "Discovery", detail: "AI finds and scores the accounts worth chasing" },
  { icon: Boxes, label: "Inventory", detail: "One stock count, shared by every sale and job" },
  { icon: CalendarClock, label: "Service", detail: "Jobs, crew and parts on one calendar" },
  { icon: MessagesSquare, label: "CRM", detail: "Every channel in one inbox, tied to the same customer" },
  { icon: ShieldCheck, label: "Finance", detail: "Accounting, GST registrations and filings, built in" },
];

const TRUST_BADGES = ["GST-ready", "GDPR-aligned", "SOC 2-aligned practices", "Full audit trail"];

/** The marketing-side context a visitor lands on `/login` or `/signup` without --
 * previously these pages were a bare form with no explanation of what they were signing
 * up for. Shown alongside the auth form on wide screens (`hidden lg:flex`); the form
 * itself stays the whole page on narrow ones rather than pushing it below a long panel. */
export function AuthInfoPanel() {
  return (
    <div className="hidden max-w-md flex-col gap-8 lg:flex">
      <div>
        <p className="text-xs font-semibold tracking-widest text-landing-accent uppercase">
          One login, every part of your business
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-landing-fg">
          {BRAND_NAME} replaces the pile of disconnected apps a growing business ends up
          with.
        </h2>
      </div>

      <ul className="flex flex-col gap-4">
        {MODULE_HIGHLIGHTS.map((mod) => (
          <li key={mod.label} className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-landing-surface-border bg-landing-bg-elevated">
              <mod.icon className="size-4 text-landing-accent" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-landing-fg">{mod.label}</p>
              <p className="text-sm text-landing-muted">{mod.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-3 rounded-xl border border-landing-surface-border bg-landing-surface px-4 py-3.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-landing-accent" aria-hidden="true" />
        <p className="text-sm text-landing-muted">
          A built-in AI assistant can answer questions using data from every module you
          license -- bring your own AI key, or use {BRAND_NAME}&apos;s own provider.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRUST_BADGES.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-landing-surface-border bg-landing-bg-elevated px-3.5 py-1 text-xs font-medium text-landing-muted"
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  );
}
