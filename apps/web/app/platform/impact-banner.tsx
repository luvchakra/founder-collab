import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@cofounderai/core/ui/alert";

/**
 * PLATFORM-P0-19.2 ("Global Impact Banner", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §33) -- a small, static, reusable warning banner for pages whose save/
 * publish action changes something every business/customer on the platform sees or is
 * bound by immediately (a plan's entitlements, a module kill switch, a feature flag, an
 * AI routing/budget policy, an integration kill switch, platform-wide session/retention
 * policy defaults, a customer-facing announcement, ...).
 *
 * **Scope decision, made explicit per this workstream's own instruction to check before
 * building anything under this heading**: the doc's own §33 mockup shows only a static
 * two-line message --
 *
 *   ⚠ Platform-wide change
 *   This configuration affects all customers using this feature.
 *
 * -- not a dynamic "this will affect N customers" count. One resource type already has a
 * real, live-computed count: `getModuleImpact()` (`packages/core/src/admin/
 * platform-modules.ts`) returns the actual number of businesses with an active/grace
 * license for a module, and `ModuleStatusDialog` (PLATFORM-P0-07.2/18.4's own
 * "destructive action protection" -- reason + live impact count + explicit
 * acknowledgement checkbox) already surfaces it, fetched fresh, whenever a superadmin is
 * about to move a module into a fully-blocked status. That is a **per-action, per-
 * resource-type** mechanism purpose-built for one genuinely destructive mutation, not a
 * generic page-level fixture -- generalizing a live affected-count query to every other
 * resource type here (feature flags, integrations, AI providers, system policies, ...)
 * would be new, nontrivial, resource-type-specific logic nowhere asked for by this
 * story's own §33 text, and PLATFORM-P0-18.2/18.4 (reauthentication + destructive-action
 * protection for every other mutation) are still open, tracked separately, for exactly
 * that future work. This component is deliberately the *other*, simpler half: a static,
 * always-shown, page-level cue that a page's config is platform-wide/shared rather than
 * per-business -- shown even where nothing is destructive, so it and `ModuleStatusDialog`
 * are complementary, not duplicates (the dialog's real count still fires on top of this
 * banner for the one mutation that has one today). §35's acceptance criterion ("Platform-
 * wide changes show impact before publishing") is satisfied by *always* showing this
 * banner ahead of the save action -- impact shown "before publishing" in the sequential-
 * UI sense, not via a computed number, for every resource type that doesn't have its own
 * `ModuleStatusDialog`-style mechanism. Per CLAUDE.md development principle #7 ("never
 * implement speculative functionality -- build only what the current story requires"),
 * this stays a static banner. The `description` prop exists only to let a page swap in a
 * more specific one-line consequence than the generic default where that's clearer --
 * never a computed value.
 *
 * Deliberately its own component (not inlined per-page) so the wording/styling is
 * identical everywhere it appears, and so any future story that *does* add a real
 * computed impact figure has exactly one place to change.
 */
export function PlatformImpactBanner({
  description = "This configuration affects all customers using this feature.",
}: {
  description?: string;
}) {
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10 text-amber-200 [&>svg]:text-amber-400">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle className="text-amber-100">Platform-wide change</AlertTitle>
      <AlertDescription className="text-amber-200/90">{description}</AlertDescription>
    </Alert>
  );
}
