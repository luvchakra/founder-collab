import { listComplianceCountries, listCompliancePacks } from "@cofounderai/core/admin/platform-compliance";
import { PlatformImpactBanner } from "../../impact-banner";
import { CountryRegistryTable } from "./country-registry-table";
import { CompliancePackTable } from "./compliance-pack-table";

/**
 * PLATFORM-P0-13.1/13.2/13.4 ("Country / Compliance Pack Administration",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §17). See
 * `packages/core/src/admin/platform-compliance.ts` and its migration's own docstrings for
 * what this registry is and why it's genuinely new, not a duplicate of `module-gst`'s own
 * compile-time `COUNTRY_CATALOG` or any business's own `gst.compliance_profiles` row.
 *
 * PLATFORM-P0-13.3 ("Rule Version") is deliberately NOT built here -- see the migration's
 * own docstring for the genuine architecture/entity-ownership conflict with `gst.tax_rules`
 * this story stopped and reported on instead of guessing at.
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `modules/page.tsx`'s own split.
 */
export default async function PlatformCompliancePage() {
  const [countries, packs] = await Promise.all([listComplianceCountries(), listCompliancePacks()]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Country / Compliance Pack Administration</h1>
        <p className="text-sm text-zinc-400">
          Which countries and country/regime compliance packs WonderArc administratively offers, platform-wide, and
          which of each pack&apos;s named capabilities are turned on.
        </p>
      </div>

      <PlatformImpactBanner />

      <CountryRegistryTable countries={countries} />
      <CompliancePackTable packs={packs} countries={countries} />
    </div>
  );
}
