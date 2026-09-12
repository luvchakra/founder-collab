import type { CSSProperties } from "react";

/**
 * PLATFORM-P0-03.3 ("Platform Login Branding") originally inlined this inside
 * `app/(auth)/layout.tsx`, the one place that consumed it. PLATFORM-P0-03.5 ("Preview
 * Before Publish") added a second consumer -- the superadmin-only branding preview page,
 * which needs the exact same background-treatment logic applied to a *draft* value instead
 * of the live one -- so it's pulled out here rather than duplicated. Pure and
 * framework-agnostic (no Supabase, no `next/navigation`) precisely so both a real page and
 * a preview page can call it with whatever branding values they have on hand.
 */
export function backgroundStyleFor(style: string, value: string | null): CSSProperties | undefined {
  if (!value) return undefined;
  if (style === "image") {
    return { backgroundImage: `url(${value})`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  if (style === "solid") return { backgroundColor: value };
  if (style === "gradient") {
    const [from, to] = value.split(",");
    if (from && to) return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
  }
  return undefined;
}
