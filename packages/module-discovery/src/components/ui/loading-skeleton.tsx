import { cn } from "@cofounderai/core/lib/utils";

/**
 * Generic page-loading placeholder for a route's loading.tsx -- a handful of pulsing
 * muted bars roughly matching a typical page's shape (a title, then a few content
 * blocks). `className` sets the same width/padding as the page it stands in for, so the
 * skeleton doesn't visibly jump when the real content replaces it.
 */
export function LoadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-2xl flex-col gap-4", className)}>
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
