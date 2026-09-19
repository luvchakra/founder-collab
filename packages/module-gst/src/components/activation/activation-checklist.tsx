import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { WizardStep } from "../../lib/activation/types";

/**
 * FIN-3: the eight steps whose completion is read from data rather than edited on this
 * page (the other two, accounting method and fiscal year, get their own small forms
 * alongside this list -- see `activation-settings-form.tsx`). Server-renderable: nothing
 * here needs client state, it's a read of `getActivationSummary`'s own steps.
 */
export function ActivationChecklist({ steps, basePath }: { steps: WizardStep[]; basePath: string }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border px-4">
      {steps.map((step) => (
        <li key={step.key} className="flex items-start justify-between gap-3 py-3">
          <div className="flex items-start gap-3">
            {step.complete ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">{step.label}</p>
              <p className="text-xs text-muted-foreground">{step.detail}</p>
            </div>
          </div>
          {step.linkSlug ? (
            <Link href={`${basePath}/${step.linkSlug}`} className="shrink-0 self-center text-xs text-primary hover:underline">
              Open
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
