import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Hierarchical context once a business (or product) has been clicked into --
 * Dashboard / Business / Product, last segment non-clickable (current page). */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
          {item.href ? (
            <Link href={item.href} className="truncate hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="truncate font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
