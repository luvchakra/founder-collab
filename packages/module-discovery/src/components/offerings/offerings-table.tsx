import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";
import type { OfferingProfileSuggestion } from "../../lib/ai/schemas";
import { OFFERING_STATUS_LABEL, OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { Offering, OfferingStatus } from "../../lib/offerings/types";
import { OfferingFormDialog } from "./offering-form-dialog";
import { OfferingRowActions } from "./offering-row-actions";

type FormResult = { error: string } | { success: true };
type SuggestResult = { error: string } | { success: true; suggestion: OfferingProfileSuggestion };

export type OfferingRow = { offering: Offering; prospectCount: number };

const STATUS_BADGE_VARIANT: Record<OfferingStatus, "secondary" | "outline" | "destructive"> = {
  active: "secondary",
  inactive: "outline",
  archived: "destructive",
};

/**
 * DISC-OFFER-P0-01.3's "professional Offering management screen" -- desktop gets a real
 * table (the Global UI Design Rule's own "prefer a table... when the user needs to
 * compare multiple rows/attributes"), narrow widths get one card per row with the same
 * fields as labeled chips (CLAUDE.md non-negotiable #12). Suggested columns per the
 * backlog (`Offering | Type | Target Market | Status | Active Discovery | Updated |
 * Actions`) minus "Active Discovery" -- that column needs a real Discovery Definition
 * to report on, which doesn't exist until DISC-OFFER-P0-04.1; adding a column with
 * nothing real behind it would be exactly the false-precision this backlog's own §5.2
 * ("no false precision... insufficient evidence") argues against for a different field.
 * It's a natural, non-breaking column to add once 04.1 lands.
 *
 * "Long descriptions are truncated with a way to view full content": target market is
 * `truncate`d in the row; the Edit dialog (pre-filled, not a separate read-only viewer)
 * is that way in -- a founder editing an offering already sees the full text, so a
 * second, read-only "view full description" surface would just be a thinner duplicate
 * of the same form.
 */
export function OfferingsTable({
  businessId,
  rows,
  createAction,
  updateAction,
  suggestAction,
  setStatusAction,
  duplicateAction,
  deleteAction,
}: {
  businessId: string;
  rows: OfferingRow[];
  createAction: (formData: FormData) => Promise<FormResult>;
  updateAction: (offeringId: string, formData: FormData) => Promise<FormResult>;
  suggestAction: (offeringId: string, description: string) => Promise<SuggestResult>;
  setStatusAction: (offeringId: string, status: OfferingStatus) => Promise<FormResult>;
  duplicateAction: (offeringId: string) => Promise<FormResult>;
  deleteAction: (offeringId: string) => Promise<FormResult>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Offerings</h2>
        <OfferingFormDialog mode="create" action={createAction} />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Create an offering to get its own GTM workspace." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Mobile: one card per row (CLAUDE.md #12) */}
          <ul className="divide-y md:hidden">
            {rows.map(({ offering, prospectCount }) => (
              <li key={offering.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/dashboard/businesses/${businessId}/products/${offering.id}`} className="min-w-0 truncate font-medium hover:underline">
                    {offering.name}
                  </Link>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <OfferingFormDialog mode="edit" offering={offering} action={updateAction.bind(null, offering.id)} suggestAction={suggestAction.bind(null, offering.id)} />
                    <OfferingRowActions
                      offeringName={offering.name}
                      status={offering.status}
                      prospectCount={prospectCount}
                      setStatusAction={setStatusAction.bind(null, offering.id)}
                      duplicateAction={duplicateAction.bind(null, offering.id)}
                      deleteAction={deleteAction.bind(null, offering.id)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant={STATUS_BADGE_VARIANT[offering.status]}>{OFFERING_STATUS_LABEL[offering.status]}</Badge>
                  {offering.offering_type ? <Badge variant="outline">{OFFERING_TYPE_LABEL[offering.offering_type]}</Badge> : null}
                  <span>{prospectCount} prospect{prospectCount === 1 ? "" : "s"}</span>
                </div>
                {offering.target_market ? <p className="truncate text-xs text-muted-foreground">{offering.target_market}</p> : null}
                <p className="text-xs text-muted-foreground">Updated {formatDate(offering.updated_at)}</p>
              </li>
            ))}
          </ul>

          {/* Desktop: proto-table */}
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Offering</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Target market</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ offering, prospectCount }) => (
                <TableRow key={offering.id}>
                  <TableCell className="max-w-48">
                    <Link href={`/dashboard/businesses/${businessId}/products/${offering.id}`} className="block truncate font-medium hover:underline">
                      {offering.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {prospectCount} prospect{prospectCount === 1 ? "" : "s"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{offering.offering_type ? OFFERING_TYPE_LABEL[offering.offering_type] : "—"}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{offering.target_market ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[offering.status]}>{OFFERING_STATUS_LABEL[offering.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(offering.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <OfferingFormDialog mode="edit" offering={offering} action={updateAction.bind(null, offering.id)} suggestAction={suggestAction.bind(null, offering.id)} />
                      <OfferingRowActions
                        offeringName={offering.name}
                        status={offering.status}
                        prospectCount={prospectCount}
                        setStatusAction={setStatusAction.bind(null, offering.id)}
                        duplicateAction={duplicateAction.bind(null, offering.id)}
                        deleteAction={deleteAction.bind(null, offering.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
