import Link from "next/link";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import type { OfferingPortfolioRow } from "../../lib/portfolio/types";

/**
 * DISC-OFFER-P1 §7-04.2 "Offering Portfolio Dashboard" -- the doc's own literal table
 * (`Offering | Hot | New | Conversations`), one row per offering on this business, each
 * linking through to that offering's own Opportunities/Conversations pages ("allow
 * drill-down"). Compact cards below `md`, a real table at `md` and up (design rule #12/
 * CLAUDE.md) -- the same split every other multi-row list in this module already uses.
 */
export function OfferingPortfolioTable({ basePath, rows }: { basePath: string; rows: OfferingPortfolioRow[] }) {
  if (rows.length === 0) {
    return <EmptyState variant="inline" message="No offerings yet -- create one to see its portfolio here." />;
  }

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.productId} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <Link href={`${basePath}/${row.productId}/opportunities`} className="font-medium hover:underline">
              {row.productName}
            </Link>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Hot: <span className="font-medium text-foreground">{row.hotCount}</span></span>
              <span>New: <span className="font-medium text-foreground">{row.newCount}</span></span>
              <span>Conversations: <span className="font-medium text-foreground">{row.conversationCount}</span></span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Offering</th>
              <th className="px-3 py-2 font-medium">Hot</th>
              <th className="px-3 py-2 font-medium">New</th>
              <th className="px-3 py-2 font-medium">Conversations</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.productId} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">{row.productName}</td>
                <td className="px-3 py-2">{row.hotCount}</td>
                <td className="px-3 py-2">{row.newCount}</td>
                <td className="px-3 py-2">{row.conversationCount}</td>
                <td className="px-3 py-2 text-right">
                  <Link href={`${basePath}/${row.productId}/opportunities`} className="text-sm font-medium text-primary hover:underline">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
