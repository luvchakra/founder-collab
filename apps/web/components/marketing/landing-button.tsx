import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@cofounderai/core/lib/utils";

/**
 * The one primary CTA style used everywhere on the landing page (design principle 4:
 * "one primary action" -- Start Free stays visually consistent, secondary actions never
 * compete with it). variant="secondary" is for things like "See How It Works" that must
 * still be visible without pulling attention away from the primary CTA. Exported as a cva
 * so non-Link triggers (e.g. the Show Interest modal's submit button) can share the exact
 * same classes instead of duplicating the style string.
 */
export const landingButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 focus-visible:ring-offset-landing-bg disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-landing-accent text-landing-accent-foreground shadow-sm shadow-landing-accent/20 hover:bg-landing-accent/90",
        secondary:
          "border border-landing-surface-border bg-landing-surface text-landing-fg hover:bg-landing-bg",
        ghost: "text-landing-fg hover:text-landing-accent",
      },
      size: {
        default: "px-5 py-2.5 text-sm",
        lg: "px-7 py-3.5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export function LandingButton({
  href,
  variant,
  size,
  className,
  children,
  ...props
}: {
  href: string;
  className?: string;
  children: ReactNode;
} & VariantProps<typeof landingButtonVariants> &
  Omit<ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={cn(landingButtonVariants({ variant, size }), className)} {...props}>
      {children}
    </Link>
  );
}
