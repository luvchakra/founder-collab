"use client";

import { useActionState } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { COUNTRY_CATALOG } from "../../lib/compliance/countries";
import type { EffectiveComplianceProfile } from "../../lib/compliance/queries";

export type CountryBarActionState = { error: string } | { success: true } | null;

/**
 * COMPLY-P0-01.2/01.3/01.5: the "active country/regime must always be visible" context
 * bar (backlog §3), mounted once in `gst/layout.tsx` above every Compliance page.
 *
 * Regime only gets its own selector when the current country's catalog entry has more
 * than one (COMPLY-P0-01.3) -- no supported country does yet, India and each of
 * COMPLY-P1-01's five EU country packs (Germany/France/Belgium/Poland/Italy) alike having
 * exactly one regime (GST or VAT respectively), so in practice only the regime badge (not
 * a control) renders today; the mechanism exists for the first future country pack that
 * needs it, per the backlog's own "do not implement future stories implicitly" balanced
 * against "build the generic mechanism this epic owns."
 *
 * Every entry whose own catalog `status` isn't `"supported"` renders as a disabled
 * `<option>` labelled "Planned" -- this is COMPLY-P0-01.5's own "clearly show supported vs
 * planned capability", not a full unsupported-country empty-state page (nothing routes a
 * business into an unsupported country in the first place, since selecting one is
 * disabled here and refused server-side). This component itself needed no change for
 * COMPLY-P1-01 to add five more selectable countries -- it was already driven entirely by
 * `COUNTRY_CATALOG`'s own `status` field, never a hard-coded country check.
 */
export function CountryBar({
  profile,
  canEdit,
  countryAction,
  regimeAction,
}: {
  profile: EffectiveComplianceProfile;
  canEdit: boolean;
  countryAction: (prevState: CountryBarActionState, formData: FormData) => Promise<CountryBarActionState>;
  regimeAction: (prevState: CountryBarActionState, formData: FormData) => Promise<CountryBarActionState>;
}) {
  const [countryState, countryFormAction] = useActionState<CountryBarActionState, FormData>(countryAction, null);
  const [regimeState, regimeFormAction] = useActionState<CountryBarActionState, FormData>(regimeAction, null);
  const current = COUNTRY_CATALOG.find((c) => c.code === profile.country);
  const regimeName = current?.regimes.find((r) => r.key === profile.regime)?.name ?? profile.regime;
  const hasRegimeChoice = (current?.regimes.length ?? 0) > 1;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Operating in</span>
        <Badge variant="secondary">{current?.name ?? profile.country}</Badge>
        <span className="text-muted-foreground">·</span>
        {hasRegimeChoice && canEdit ? null : <Badge variant="outline">{regimeName}</Badge>}
        {!profile.isExplicit ? <span className="text-xs text-muted-foreground">(default)</span> : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action={countryFormAction} className="flex items-center gap-2">
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

          {hasRegimeChoice ? (
            <form action={regimeFormAction} className="flex items-center gap-2">
              <NativeSelect
                name="regime"
                defaultValue={profile.regime}
                className="w-auto min-w-40"
                aria-label="Tax regime"
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              >
                {current!.regimes.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </form>
          ) : null}
        </div>
      ) : null}

      {countryState && "error" in countryState ? (
        <p className="text-xs text-destructive sm:ml-4">{countryState.error}</p>
      ) : null}
      {regimeState && "error" in regimeState ? <p className="text-xs text-destructive sm:ml-4">{regimeState.error}</p> : null}
    </div>
  );
}
