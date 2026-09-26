"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { DEFAULT_DIMENSION_LABEL, DIMENSION_HELP, type DimensionSetting } from "../../lib/dimensions/derive";

export type DimensionSettingsState = { error: string } | { success: true } | null;

/**
 * FIN-9: which dimensions this business reports by, and what it calls them. Every one is
 * optional — switching one on adds a field and a report tab, it never makes a line invalid.
 */
export function DimensionSettingsForm({
  settings,
  action,
}: {
  settings: DimensionSetting[];
  action: (prev: DimensionSettingsState, formData: FormData) => Promise<DimensionSettingsState>;
}) {
  const [state, formAction] = useActionState<DimensionSettingsState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold">Dimensions you use</h2>
        <p className="text-sm text-muted-foreground">
          All optional. A line without one is still a valid line — it just reports as &ldquo;Unassigned&rdquo;.
        </p>
      </div>
      <ul className="divide-y rounded-xl border border-border">
        {settings.map((setting) => (
          <li key={setting.key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex min-w-0 items-start gap-3">
              <input
                type="checkbox"
                name={`enabled_${setting.key}`}
                defaultChecked={setting.enabled}
                className="mt-1 size-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{DEFAULT_DIMENSION_LABEL[setting.key]}</span>
                <span className="block text-xs text-muted-foreground">{DIMENSION_HELP[setting.key]}</span>
              </span>
            </label>
            <div className="flex flex-col gap-1 sm:w-56">
              <Label htmlFor={`label_${setting.key}`} className="text-xs text-muted-foreground">
                Call it
              </Label>
              <Input
                id={`label_${setting.key}`}
                name={`label_${setting.key}`}
                maxLength={40}
                defaultValue={setting.label === DEFAULT_DIMENSION_LABEL[setting.key] ? "" : setting.label}
                placeholder={DEFAULT_DIMENSION_LABEL[setting.key]}
              />
            </div>
          </li>
        ))}
      </ul>
      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive-subtle">{state.error}</p>
      ) : state && "success" in state ? (
        <p aria-live="polite" className="text-sm text-success-subtle">Saved.</p>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingText="Saving...">Save dimensions</SubmitButton>
      </div>
    </form>
  );
}
