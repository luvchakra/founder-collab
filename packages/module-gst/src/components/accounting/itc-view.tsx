import { AlertTriangle, CheckCircle2, HelpCircle, TrendingUp } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { ledgerAmount } from "./labels";
import type { ItcAssessment } from "../../lib/accounting/itc";

const TONE: Record<ItcAssessment["risk"], { border: string; text: string; Icon: typeof AlertTriangle }> = {
  clear: { border: "border-success/30 bg-success/5", text: "text-success-subtle", Icon: CheckCircle2 },
  over_claimed: { border: "border-destructive/30 bg-destructive/5", text: "text-destructive-subtle", Icon: AlertTriangle },
  leaving_credit: { border: "border-warning/30 bg-warning/5", text: "text-warning-subtle", Icon: TrendingUp },
  unknown: { border: "border-border bg-card", text: "text-muted-foreground", Icon: HelpCircle },
};

/**
 * Input tax credit: what can be claimed, and what is at risk.
 *
 * Over-claiming reads as an error and under-claiming as a warning, because that is the
 * difference between them — one gets reversed with interest, the other only costs you the
 * credit. Treating both as the same colour would train people to ignore the one that
 * actually bites.
 */
export function ItcView({ assessment, actions }: { assessment: ItcAssessment; actions: string[] }) {
  const tone = TONE[assessment.risk];
  const { Icon } = tone;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Input tax credit</h2>

      <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm", tone.border, tone.text)}>
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{assessment.headline}</span>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
        <Figure label="Claimable" value={assessment.claimable} tone="text-foreground" />
        <Figure
          label="At risk"
          value={assessment.atRisk}
          tone={assessment.atRisk > 0 ? "text-destructive-subtle" : "text-muted-foreground"}
          detail={assessment.atRisk > 0 ? "Beyond what 2B supports" : undefined}
        />
        <Figure
          label="Not taken up"
          value={assessment.unclaimed}
          tone={assessment.unclaimed > 0 ? "text-warning-subtle" : "text-muted-foreground"}
          detail={assessment.unclaimed > 0 ? "Offered in 2B" : undefined}
        />
        <Figure
          label="Outside 2B"
          value={assessment.excludedNoGstin}
          tone="text-muted-foreground"
          detail="Suppliers with no GSTIN"
        />
      </dl>

      {actions.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-3 text-sm">
          <p className="font-medium">What to do about it</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Figure({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number;
  tone: string;
  detail?: string;
}) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-balance text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate text-base font-semibold tracking-tight tabular-nums", tone)}>
        {ledgerAmount.format(value)}
      </dd>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
