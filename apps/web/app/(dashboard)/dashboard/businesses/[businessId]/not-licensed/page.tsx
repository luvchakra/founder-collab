import Link from "next/link";
import { Lock } from "lucide-react";
import { moduleRegistry } from "@cofounderai/module-registry";
import { Alert, AlertDescription, AlertTitle } from "@cofounderai/core/ui/alert";
import { Button } from "@cofounderai/core/ui/button";
import { formatDate } from "@cofounderai/core/lib/format";

/**
 * The informative page `middleware.ts`'s route guard rewrites to instead of a bare 404
 * (docs/testing/test-cases/menu-smoke.md's TC-MENU-LIC-001/002, TC-CORE-001/002/003,
 * TC-SHELL-002/006 -- refined 2026-09-08 to spec exactly this page). Reached only
 * through that rewrite ("module"/"reason" are always set by the guard, never
 * user-supplied navigation) -- a person still sees the URL they actually asked for in
 * their browser, this is what renders at it.
 *
 * Deliberately distinct from a genuine 404 (a URL that never existed at all, e.g. one of
 * `menu-smoke.md`'s own known-gap cases before they were fixed) -- this always names the
 * real module and the real reason, since the business itself already knows which
 * modules exist (the module switcher lists all of them, just filtered by entitlement --
 * see the 2026-09-08 sidebar fix); the two states this page's own README calls out as
 * needing to look different are "you don't have this" (this page) vs. "this doesn't
 * exist" (an actual 404), not "which modules exist at all."
 */
export default async function NotLicensedPage({
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ module?: string; reason?: string; graceEndsAt?: string }>;
}) {
  const { module: moduleKey, reason, graceEndsAt } = await searchParams;

  const matchedModule = moduleRegistry.find((m) => m.key === moduleKey);
  const moduleName = matchedModule?.name ?? "This module";

  const { title, description } = describeReason(moduleName, reason, graceEndsAt);
  // PLATFORM-P0-07.2: a platform-wide kill switch is not a licensing problem this
  // business can fix, so its CTA points back at the dashboard rather than a "Licenses"
  // page that would imply reactivating something fixes it.
  const isPlatformDisabled = reason === "platform_disabled";
  const ctaHref = isPlatformDisabled ? "/dashboard" : "/dashboard/settings/licenses";
  const ctaLabel = isPlatformDisabled ? "Back to Dashboard" : "Go to Settings → Licenses";

  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <Lock className="size-8 text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
      <Alert>
        <AlertTitle>What this means</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
      </Alert>
      <Button asChild>
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

function describeReason(
  moduleName: string,
  reason: string | undefined,
  graceEndsAt: string | undefined,
): { title: string; description: string } {
  if (reason === "grace") {
    const until = graceEndsAt ? formatDate(graceEndsAt) : "soon";
    return {
      title: `${moduleName} isn't licensed yet`,
      description: `${moduleName}'s license was cancelled and is in its 30-day read-only grace period until ${until}. Your data is retained, not deleted -- reactivate the license to resume editing.`,
    };
  }
  if (reason === "expired") {
    return {
      title: `${moduleName} isn't licensed yet`,
      description: `${moduleName}'s license grace period has ended, so access is fully denied for now. Your data is retained, not deleted -- reactivate the license any time to restore full access immediately, exactly as it was.`,
    };
  }
  if (reason === "platform_disabled") {
    // PLATFORM-P0-07.2 ("Platform-Wide Module Kill Switch") -- distinct from every other
    // reason above: this business's own license is fine, WonderArc has temporarily
    // disabled the module for every business. Reactivating a license (the CTA every other
    // reason points at) would not help here, so the copy says so plainly rather than
    // implying a fix the business itself can make.
    return {
      title: `${moduleName} is temporarily unavailable`,
      description: `${moduleName} has been temporarily disabled platform-wide by WonderArc. This is not a licensing issue on your account -- your license and data are unaffected, and access will return automatically once the module is re-enabled.`,
    };
  }
  return {
    title: `${moduleName} isn't part of your plan yet`,
    description: `${moduleName} isn't licensed for this business. Activate it from Settings → Licenses to unlock it.`,
  };
}
