import Image from "next/image";
import { BRAND_MARK } from "../../brand/generated/assets";
import { cn } from "../../lib/utils";

/**
 * The WonderArk mark on its own — the ribbon W with its swoosh and sparkle, no wordmark —
 * for the places that have no room for one.
 *
 * Two files, because the mark is drawn twice rather than recoloured: the light-ground
 * artwork carries a navy underside that would disappear on a dark ground, and the
 * dark-ground artwork a white one that would disappear on a light one. Both are written at
 * identical dimensions (scripts/build-brand-assets.mjs), so swapping between them never
 * shifts the layout, and both paths and sizes come from the generated manifest rather than
 * being copied here, where they would go stale the next time the artwork changes.
 *
 * Swapping via the `dark:` variant is pure CSS, so this works in Server Components with
 * no client JS and follows the real "Appearance" toggle
 * (packages/core/src/components/theme/theme-provider.tsx) even though the platform
 * defaults to light per docs/DESIGN.md.
 */
export function LogoMark({ className, onDark }: { className?: string; onDark?: boolean }) {
  // `onDark` is for surfaces that are dark in *both* themes — the navigation rail, the
  // platform admin header — where following the `dark:` variant would paint the navy
  // artwork onto a navy background.
  if (onDark) {
    return <Image {...BRAND_MARK.onDark} alt="" priority className={className} />;
  }
  return (
    <>
      <Image {...BRAND_MARK.onLight} alt="" priority className={cn(className, "block dark:hidden")} />
      <Image {...BRAND_MARK.onDark} alt="" priority className={cn(className, "hidden dark:block")} />
    </>
  );
}
