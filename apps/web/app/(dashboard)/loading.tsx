import { WonderArkLogo } from "@cofounderai/core/shell/wonderark-logo";

/**
 * Next.js loading UI convention: wraps every page below this layout segment in a
 * Suspense boundary, so this shows instantly on navigation while the destination page's
 * data is still fetching, without re-rendering the header/sidebar chrome in
 * app/(dashboard)/layout.tsx.
 *
 * BRAND-05 (§14): the standalone mark, animated as one object -- the whole mark pulses;
 * the wedge is never animated on its own. `motion-safe` keeps it still for anyone who
 * has asked for reduced motion.
 */
export default function DashboardLoading() {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3 p-12">
      <WonderArkLogo variant="mark" size="lg" adaptive decorative className="motion-safe:animate-pulse" />
      <span className="text-sm text-muted-foreground">Loading…</span>
    </div>
  );
}
