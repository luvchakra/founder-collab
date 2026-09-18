import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import type { CheckStatus, FilingReadiness } from "../../lib/accounting/filing-readiness";

const STATUS: Record<CheckStatus, { Icon: typeof CheckCircle2; tone: string; label: string }> = {
  pass: { Icon: CheckCircle2, tone: "text-success-subtle", label: "Fine" },
  warn: { Icon: AlertTriangle, tone: "text-warning-subtle", label: "Worth a look" },
  block: { Icon: XCircle, tone: "text-destructive-subtle", label: "Must fix" },
  unknown: { Icon: CircleHelp, tone: "text-muted-foreground", label: "Can't tell" },
};

/**
 * Whether this return is safe to file.
 *
 * Ordered by what needs attention rather than by check number: blockers, then things
 * worth a look, then everything that passed. A list that reads in a fixed order makes
 * someone scan all of it to find the one row that matters.
 *
 * Nothing here files anything or marks anything as filed. It answers a question; the
 * person decides.
 */
export function FilingReadinessView({ readiness, period }: { readiness: FilingReadiness; period: string }) {
  const ordered = [
    ...readiness.checks.filter((c) => c.status === "block"),
    ...readiness.checks.filter((c) => c.status === "warn" || c.status === "unknown"),
    ...readiness.checks.filter((c) => c.status === "pass"),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4",
          readiness.blockers.length > 0
            ? "border-destructive/30 bg-destructive/5"
            : readiness.warnings.length > 0
              ? "border-warning/30 bg-warning/5"
              : "border-success/30 bg-success/5",
        )}
      >
        {readiness.blockers.length > 0 ? (
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive-subtle" aria-hidden="true" />
        ) : readiness.warnings.length > 0 ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-subtle" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-subtle" aria-hidden="true" />
        )}
        <div>
          <p className="font-semibold">{readiness.headline}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">For {period}.</p>
        </div>
      </div>

      <ul className="divide-y rounded-2xl border border-border">
        {ordered.map((check) => {
          const { Icon, tone, label } = STATUS[check.status];
          return (
            <li key={check.key} className="flex items-start gap-3 p-3.5 text-sm">
              <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="font-medium">{check.label}</p>
                  <span className={cn("text-xs", tone)}>{label}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{check.detail}</p>
                {check.action ? <p className="mt-1 text-xs text-muted-foreground">{check.action}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
