import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { SeverityBadge } from "./severity-badge";
import type { RiskSignal, RiskSignalKind } from "../../lib/risk/types";

const KIND_LABEL: Record<RiskSignalKind, string> = {
  return_not_approved: "Return not approved",
  einvoice_deadline: "E-invoice deadline",
  unmatched_itc: "Unmatched ITC",
  missing_tax_registration: "Missing tax registration",
  invalid_classification: "Invalid classification",
  failed_submission: "Failed submission",
};

/**
 * COMPLY-P0-11.4 (Row-Level Actions): where "Review" for this signal's own kind actually
 * goes -- each destination is a real, already-built page (COMPLY-P0-04.1's own
 * Registrations, COMPLY-P0-05's own e-Invoicing, COMPLY-P0-07's own Filing, or this
 * epic's own new Reconciliation page), never a placeholder link. `"invalid_classification"`
 * has none: the item it names lives in `module-inventory`'s own product page, out of this
 * workstream's `module-gst`-only scope to deep-link into -- omitted rather than a broken
 * or cross-module link (per the design rules: "provide contextual actions relevant to the
 * item... without cluttering the row" -- no action is better than a wrong one).
 */
function reviewHref(base: string, kind: RiskSignalKind): string | null {
  switch (kind) {
    case "return_not_approved":
      return `${base}/filing`;
    case "einvoice_deadline":
      return `${base}/einvoicing`;
    case "unmatched_itc":
      return `${base}/reconciliation`;
    case "missing_tax_registration":
      return `${base}/registrations`;
    case "invalid_classification":
    case "failed_submission":
      return null;
  }
}

export function RiskSignalsList({ businessId, signals }: { businessId: string; signals: RiskSignal[] }) {
  const base = `/dashboard/businesses/${businessId}/gst`;

  if (signals.length === 0) {
    return <EmptyState icon={ShieldCheck} message="No compliance risks detected right now." />;
  }

  return (
    <div className="rounded-2xl border border-border">
      {/* Compact cards below `md` -- never a horizontally-scrolling table on a small screen. */}
      <ul className="divide-y md:hidden">
        {signals.map((signal, index) => {
          const href = reviewHref(base, signal.kind);
          return (
            <li key={index} className="flex flex-col gap-2 p-3 text-sm">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-medium">{KIND_LABEL[signal.kind]}</span>
                <SeverityBadge severity={signal.severity} />
              </div>
              <p className="text-xs text-muted-foreground">{signal.summary}</p>
              {href ? (
                <div className="flex justify-end">
                  <Button asChild variant="outline" size="sm">
                    <Link href={href}>Review</Link>
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Signal</TableHead>
            <TableHead>Details</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((signal, index) => {
            const href = reviewHref(base, signal.kind);
            return (
              <TableRow key={index}>
                <TableCell>
                  <SeverityBadge severity={signal.severity} />
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">{KIND_LABEL[signal.kind]}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{signal.summary}</TableCell>
                <TableCell className="text-right">
                  {href ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={href}>Review</Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
