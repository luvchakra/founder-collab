import Image from "next/image";
import { BRAND_LOGO, type BrandAsset } from "../../brand/generated/assets";
import { cn } from "../../lib/utils";

/**
 * BRAND-04 (docs/plan/16-BRANDING-BACKLOG.md §7) -- the one way the platform renders its
 * logo. Every variant is the supplied logomark (brand/wonderark-mark.png) or a crop of the
 * approved brand board (brand/wonderark-brand-board.png), prepared by
 * scripts/build-brand-assets.mjs; nothing here or anywhere else draws a logo.
 *
 * - `primary` / `dark` -- the board's "Primary logo" and "Logo on dark" stacked lockups.
 * - `horizontal` -- the board's "Horizontal logo".
 * - `mark` / `mark-dark` -- the supplied W + wedge logomark, for light / navy grounds.
 * - `mono` / `gray` -- the board's dark and grey "Logo variations".
 *
 * `adaptive` renders a light-ground variant with its navy-ground twin swapped in by the
 * `dark:` variant -- pure CSS, so it works in Server Components and follows the
 * Appearance toggle. Leave it off on surfaces that are dark in both themes (the rail).
 */
export type WonderArkLogoVariant = "primary" | "dark" | "horizontal" | "mark" | "mark-dark" | "mono" | "gray";

export type WonderArkLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

export const WONDERARK_LOGO_ASSETS: Record<WonderArkLogoVariant, BrandAsset> = {
  primary: BRAND_LOGO.primary,
  dark: BRAND_LOGO.primaryDark,
  horizontal: BRAND_LOGO.horizontal,
  mark: BRAND_LOGO.mark,
  "mark-dark": BRAND_LOGO.markOnDark,
  mono: BRAND_LOGO.mono,
  gray: BRAND_LOGO.gray,
};

const DARK_TWIN: Partial<Record<WonderArkLogoVariant, WonderArkLogoVariant>> = {
  primary: "dark",
  mark: "mark-dark",
};

type Family = "stacked" | "horizontal" | "mark";

const FAMILY: Record<WonderArkLogoVariant, Family> = {
  primary: "stacked",
  dark: "stacked",
  mono: "stacked",
  gray: "stacked",
  horizontal: "horizontal",
  mark: "mark",
  "mark-dark": "mark",
};

/**
 * Heights per size; widths follow the artwork. The smallest size of each family keeps
 * the spec's minimums (§27): the stacked lockup ~120px wide, the horizontal ~140px, the
 * mark ~20px.
 */
export const WONDERARK_LOGO_HEIGHT: Record<Family, Record<WonderArkLogoSize, string>> = {
  stacked: { xs: "h-20", sm: "h-24", md: "h-32", lg: "h-40", xl: "h-52" },
  horizontal: { xs: "h-6", sm: "h-8", md: "h-10", lg: "h-12", xl: "h-16" },
  mark: { xs: "h-3", sm: "h-4", md: "h-6", lg: "h-10", xl: "h-16" },
};

export function WonderArkLogo({
  variant = "primary",
  size = "md",
  adaptive = false,
  decorative = false,
  alt = "WonderArk",
  priority = false,
  className,
}: {
  variant?: WonderArkLogoVariant;
  size?: WonderArkLogoSize;
  /** Swap in the navy-ground twin under the dark theme (light-ground variants only). */
  adaptive?: boolean;
  /** Next to a visible "WonderArk" label, or repeated: hidden from assistive tech (§30). */
  decorative?: boolean;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const sizing = cn(WONDERARK_LOGO_HEIGHT[FAMILY[variant]][size], "w-auto shrink-0 select-none", className);
  const a11y = decorative ? { alt: "", "aria-hidden": true as const } : { alt };
  const twin = adaptive ? DARK_TWIN[variant] : undefined;

  if (!twin) {
    return <Image {...WONDERARK_LOGO_ASSETS[variant]} {...a11y} priority={priority} draggable={false} className={sizing} data-logo-variant={variant} />;
  }
  return (
    <>
      <Image {...WONDERARK_LOGO_ASSETS[variant]} {...a11y} priority={priority} draggable={false} className={cn(sizing, "dark:hidden")} data-logo-variant={variant} />
      <Image
        {...WONDERARK_LOGO_ASSETS[twin]}
        alt=""
        aria-hidden
        priority={priority}
        draggable={false}
        className={cn(sizing, "hidden dark:block")}
        data-logo-variant={twin}
      />
    </>
  );
}
