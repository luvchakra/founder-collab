import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompliancePack, listCompliancePackFeatures } from "@cofounderai/core/admin/platform-compliance";
import { PlatformImpactBanner } from "../../../../impact-banner";
import { FeatureFlagsSection } from "./feature-flags-section";

/**
 * PLATFORM-P0-13.4 ("Compliance Feature Flags") -- one pack's own feature-flag list.
 * Mirrors `plans/[id]/entitlements/page.tsx`'s own nested-detail-page shape.
 */
export default async function CompliancePackFeaturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await getCompliancePack(id);
  if (!pack) notFound();

  const features = await listCompliancePackFeatures(id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Link href="/platform/compliance" className="text-xs text-zinc-400 hover:text-zinc-200">
          ← Country / Compliance Pack Administration
        </Link>
        <h1 className="mt-1 text-xl font-semibold">
          {pack.displayName} — Feature flags
        </h1>
        <p className="text-sm text-zinc-400">
          Which named capabilities within this compliance pack are turned on, platform-wide.
        </p>
      </div>

      <PlatformImpactBanner />

      <FeatureFlagsSection packId={id} features={features} />
    </div>
  );
}
