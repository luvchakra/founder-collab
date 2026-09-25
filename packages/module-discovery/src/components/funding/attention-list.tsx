import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import type { FundingAttentionItem } from "../../lib/funding/attention";

/** FND-03/FND-16 — rule-based attention items, each with reason, data and source. */
export function FundingAttentionList({ items, root }: { items: FundingAttentionItem[]; root: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.key} className="rounded-lg border bg-card p-3">
          <div className="flex items-start gap-2">
            {item.severity === "low" ? (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <AlertTriangle
                className={`mt-0.5 size-4 shrink-0 ${item.severity === "high" ? "text-destructive" : "text-warning-subtle"}`}
                aria-hidden="true"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <Link href={`${root}/${item.href}`} className="text-xs font-medium text-primary hover:underline">
                  Open
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">{item.action}</p>
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none hover:text-foreground">Why</summary>
                <p className="mt-1">{item.reason}</p>
                <p className="mt-1">Data: {item.data}</p>
                <p className="mt-1">Source: {item.source} · rule-based</p>
              </details>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
