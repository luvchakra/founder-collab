// EXP-ADMIN-05 -- Compliance registry export.
import {
  listComplianceCountries,
  listCompliancePackFeatures,
  listCompliancePacks,
  type ComplianceCountry,
  type CompliancePack,
} from "@cofounderai/core/admin/platform-compliance";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

type FeatureRow = { country: string; pack: string; feature: string; key: string; enabled: boolean; updatedAt: string };

/** Countries, their compliance packs (regime, version, availability) and each pack's
 * feature flags -- the registry as configured, nothing credential-shaped. */
export const platformComplianceExport: PlatformExportAdapter<Record<string, never>> = {
  id: "platform.compliance",
  parseFilters: () => ({}),
  async load() {
    const [countries, packs] = await Promise.all([listComplianceCountries(), listCompliancePacks()]);
    const countryName = new Map(countries.map((c) => [c.countryCode, c.name]));
    const features: FeatureRow[] = (
      await Promise.all(
        packs.map(async (pack) =>
          (await listCompliancePackFeatures(pack.id)).map((f) => ({
            country: countryName.get(pack.countryCode) ?? pack.countryCode,
            pack: pack.displayName,
            feature: f.displayName,
            key: f.featureKey,
            enabled: f.enabled,
            updatedAt: f.updatedAt,
          })),
        ),
      )
    ).flat();
    return {
      module: "platform",
      resource: "compliance-registry",
      title: "Compliance registry",
      sheets: [
        {
          sheetName: "Countries",
          columns: [
            { key: "code", header: "Country code", getValue: (c: ComplianceCountry) => c.countryCode },
            { key: "name", header: "Country", getValue: (c: ComplianceCountry) => c.name },
            { key: "enabled", header: "Available", type: "boolean", getValue: (c: ComplianceCountry) => c.enabled },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (c: ComplianceCountry) => c.updatedAt },
          ],
          rows: countries,
        },
        {
          sheetName: "Packs",
          columns: [
            { key: "country", header: "Country", getValue: (p: CompliancePack) => countryName.get(p.countryCode) ?? p.countryCode },
            { key: "pack", header: "Compliance pack", getValue: (p: CompliancePack) => p.displayName },
            { key: "regime", header: "Regime", getValue: (p: CompliancePack) => p.regime },
            { key: "version", header: "Version", getValue: (p: CompliancePack) => p.version },
            { key: "enabled", header: "Available", type: "boolean", getValue: (p: CompliancePack) => p.enabled },
            { key: "effective", header: "Effective from", type: "datetime", getValue: (p: CompliancePack) => p.createdAt },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (p: CompliancePack) => p.updatedAt },
          ],
          rows: packs,
        },
        {
          sheetName: "Pack features",
          columns: [
            { key: "country", header: "Country", getValue: (f: FeatureRow) => f.country },
            { key: "pack", header: "Compliance pack", getValue: (f: FeatureRow) => f.pack },
            { key: "feature", header: "Feature", getValue: (f: FeatureRow) => f.feature },
            { key: "key", header: "Feature key", getValue: (f: FeatureRow) => f.key },
            { key: "enabled", header: "Enabled", type: "boolean", getValue: (f: FeatureRow) => f.enabled },
            { key: "updatedAt", header: "Last updated", type: "datetime", getValue: (f: FeatureRow) => f.updatedAt },
          ],
          rows: features,
        },
      ],
    };
  },
};
