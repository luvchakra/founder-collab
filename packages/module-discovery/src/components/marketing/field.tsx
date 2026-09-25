import type { ReactNode } from "react";
import { Label } from "@cofounderai/core/ui/label";

/** A labelled form field with optional hint — plain markup, usable from server pages. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A numbered section of a longer form (the campaign create flow's five steps, §9.3). */
export function FormStep({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">
        <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          {step}
        </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
