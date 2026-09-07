import Image from "next/image";
import { cn } from "../../lib/utils";

/**
 * Ported from co-founder-ai's components/ui/logo-mark.tsx (docs/PORT-PROVENANCE.md).
 * The mark's "tie" silhouette is a near-white fill (intentional on a dark background)
 * that all but disappears on the platform's light theme -- logo-mark-light.png is the
 * same file with that fill recolored to a dark violet-gray. Swapping via the `dark:`
 * variant is pure CSS, so this works in Server Components (the sidebar header) with no
 * client JS, and is ready for the "Appearance" dark-mode toggle co-founder-ai already
 * exposes even though the platform defaults to light per docs/DESIGN.md.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <>
      <Image
        src="/logo-mark-light.png"
        alt=""
        width={442}
        height={350}
        priority
        className={cn(className, "block dark:hidden")}
      />
      <Image
        src="/logo-mark.png"
        alt=""
        width={442}
        height={350}
        priority
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
