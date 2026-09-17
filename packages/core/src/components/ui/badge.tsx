"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      /* Soft tinted pills, not solid blocks — the platform's one status color mapping
       * (docs/DESIGN.md): blue = in progress/informational, green = done/positive,
       * amber = pending/needs attention, red = failed/cancelled/overdue. */
      variant: {
        default: "border-transparent bg-primary/10 text-primary-subtle",
        secondary: "border-transparent bg-muted text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive-subtle",
        success: "border-transparent bg-success/12 text-success-subtle",
        warning: "border-transparent bg-warning/15 text-warning-subtle",
        solid: "border-transparent bg-primary text-primary-foreground",
        outline: "border-border bg-card text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };