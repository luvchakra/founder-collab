import Image from "next/image";
import { cn } from "../../lib/utils";

/**
 * Ported from co-founder-ai's components/ui/logo-mark.tsx (docs/PORT-PROVENANCE.md).
 * logo-mark.png's "tie" silhouette is a dark navy fill (for a light background);
 * logo-mark-light.png is the same artwork recolored to a near-white fill (for a dark
 * background) -- named for the *artwork's* own color, not which theme it belongs on,
 * which is the opposite of what these two `dark:`-gated branches originally assumed.
 * Swapping via the `dark:` variant is pure CSS, so this works in Server Components (the
 * topbar) with no client JS, and follows the real "Appearance" dark-mode toggle
 * (packages/core/src/components/theme/theme-provider.tsx) even though the platform
 * defaults to light per docs/DESIGN.md.
 */
export function LogoMark({ className, onDark }: { className?: string; onDark?: boolean }) {
  // `onDark` is for surfaces that are dark in *both* themes (the sidebar rail), where
  // following the `dark:` variant would paint the navy artwork onto a navy background.
  if (onDark) {
    return <Image src="/logo-mark-light.png" alt="" width={442} height={350} priority className={className} />;
  }
  return (
    <>
      <Image
        src="/logo-mark.png"
        alt=""
        width={442}
        height={350}
        priority
        className={cn(className, "block dark:hidden")}
      />
      <Image
        src="/logo-mark-light.png"
        alt=""
        width={442}
        height={350}
        priority
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
