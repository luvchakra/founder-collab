"use client";

import { useActionState } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { COUNTRY_CATALOG } from "../../lib/compliance/countries";
import type { EffectiveComplianceProfile } from "../../lib/compliance/queries";

export type CountryBarActionState = { error: string } | { success: true } | null;

/**
 * COMPLY-P0-01.2/01.3/01.5: the "active country/regime must always be visible" context
 * bar (backlog §3), mounted once in `gst/layout.tsx` above every Compliance page. Only
 * country is user-selectable in P0 -- regime has no independent UI yet (COMPLY-P0-01.3),
 * it just follows the chosen country's single default regime (`setComplianceCountry`).
 *
 * Every non-India entry in the catalog renders as a disabled `<option>` labelled
 * "Planned" -- this is COMPLY-P0-01.5's own "clearly show supported vs planned
 * capability", not a full unsupported-country empty-state page (nothing routes a
 * business into an unsupported country in the first place, since selecting one is
 * disabled here and refused server-side).
 */
export function CountryBar({
  profile,
  canEdit,
  action,
}: {
  profile: EffectiveComplianceProfile;
  canEdit: boolean;
  action: (prevState: CountryBarActionState, formData: FormData) => Promise<CountryBarActionState>;
}) {
  const [state, formAction] = useActionState<CountryBarActionState, FormData>(action, null);
  const current = COUNTRY_CATALOG.find((c) => c.code === profile.country);
  const regimeName = current?.regimes.find((r) => r.key === profile.regime)?.name ?? profile.regime;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operating in</span>
        <Badge variant="secondary">{current?.name ?? profile.country}</Badge>
        <span className="text-muted-foreground">·</span>
        <Badge variant="outline">{regimeName}</Badge>
        {!profile.isExplicit ? <span className="text-xs text-muted-foreground">(default)</span> : null}
      </div>

      {canEdit ? (
        <form action={formAction} className="flex items-center gap-2">
          <NativeSelect
            name="country"
            defaultValue={profile.country}
            className="w-auto min-w-40"
            aria-label="Compliance country"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {COUNTRY_CATALOG.map((c) => (
              <option key={c.code} value={c.code} disabled={c.status !== "supported"}>
                {c.name}
                {c.status !== "supported" ? " (Planned)" : ""}
              </option>
            ))}
          </NativeSelect>
        </form>
      ) : null}

      {state && "error" in state ? <p className="text-xs text-destructive sm:ml-4">{state.error}</p> : null}
    </div>
  );
}
