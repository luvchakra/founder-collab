import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { cn } from "@cofounderai/core/lib/utils";
import { PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import { RELEVANCE_LABEL, SENIORITY_LABEL } from "../../lib/buyer-intelligence/types";
import type { BuyerIntelligenceConfidence, BuyerPersonIntelligence } from "../../lib/buyer-intelligence/types";

/** DISC-OFFER-P1-05.2: the doc's own "Buyers" table column set (Person | Role | Fit |
 * Evidence | Confidence | Action). Maps onto `BuyerPersonIntelligence` (DISC-OFFER-P0-06.3)
 * directly -- Person = name/title/seniority, Role = matched buying-committee persona (or
 * "Unassigned role", never invented), Fit = relevance-to-offering plus its own reason,
 * Evidence = the first supporting evidence statement found in research (or "None found
 * yet" -- never fabricated), Confidence = this characterization's own confidence. "Action"
 * is deliberately omitted -- no contact-editing affordance exists anywhere on this page
 * today, so there is nothing real for a per-row action to do yet; inventing one would be
 * exactly the speculative functionality CLAUDE.md dev principle #7 forbids. */

const CONFIDENCE_BADGE_CLASS: Record<BuyerIntelligenceConfidence, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-muted text-muted-foreground",
};

function ConfidenceBadge({ confidence }: { confidence: BuyerIntelligenceConfidence }) {
  return <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", CONFIDENCE_BADGE_CLASS[confidence])}>{confidence} confidence</span>;
}

export function BuyerIntelligenceTable({ buyerIntelligence }: { buyerIntelligence: BuyerPersonIntelligence[] }) {
  if (buyerIntelligence.length === 0) {
    return <p className="text-sm text-muted-foreground">No contacts recorded yet -- add a contact to see buyer intelligence.</p>;
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Mobile: one card per row (CLAUDE.md #12) -- same card shape this section already
       * used before this story, kept as-is rather than replaced by the desktop table. */}
      <ul className="flex flex-col divide-y md:hidden">
        {buyerIntelligence.map((person) => (
          <li key={person.contact.id} className="flex flex-col gap-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{person.name}</span>
              {person.title ? <span className="text-muted-foreground">— {person.title}</span> : null}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{SENIORITY_LABEL[person.seniority]}</span>
              {person.persona ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{PERSONA_ROLE_LABEL[person.persona.role_in_committee]}</span>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Unassigned role</span>
              )}
              <ConfidenceBadge confidence={person.confidence} />
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Fit: </span>
              {RELEVANCE_LABEL[person.relevance]} — {person.relevanceReason}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Evidence: </span>
              {person.supportingEvidence[0]?.statement ?? "None found yet."}
            </p>
          </li>
        ))}
      </ul>

      {/* Desktop: proto-table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Fit</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {buyerIntelligence.map((person) => (
            <TableRow key={person.contact.id}>
              <TableCell className="max-w-48">
                <p className="truncate font-medium">{person.name}</p>
                <p className="truncate text-xs text-muted-foreground">{person.title ?? SENIORITY_LABEL[person.seniority]}</p>
              </TableCell>
              <TableCell>
                {person.persona ? (
                  <Badge variant="secondary">{PERSONA_ROLE_LABEL[person.persona.role_in_committee]}</Badge>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </TableCell>
              <TableCell className="max-w-64 text-muted-foreground">
                <span className="font-medium text-foreground">{RELEVANCE_LABEL[person.relevance]}</span> — {person.relevanceReason}
              </TableCell>
              <TableCell className="max-w-64 text-muted-foreground">{person.supportingEvidence[0]?.statement ?? "None found yet."}</TableCell>
              <TableCell>
                <ConfidenceBadge confidence={person.confidence} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
