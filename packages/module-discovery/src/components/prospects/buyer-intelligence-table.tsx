import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { cn } from "@cofounderai/core/lib/utils";
import { PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import { BUYING_ROLE_LABEL } from "../../lib/contacts/types";
import type { OtherOfferingRole } from "../../lib/contacts/cross-offering";
import { OtherOfferingRoles } from "./other-offering-roles";
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

/** DISC-OFFER-P1-04.3: the role shown for a person is the one the founder set for this
 * offering when there is one, otherwise the buyer persona their title matched. */
function roleLabelFor(person: BuyerPersonIntelligence): { label: string; set: boolean } | null {
  if (person.contact.buying_role) return { label: BUYING_ROLE_LABEL[person.contact.buying_role], set: true };
  if (person.persona) return { label: PERSONA_ROLE_LABEL[person.persona.role_in_committee], set: false };
  return null;
}

export function BuyerIntelligenceTable({
  buyerIntelligence,
  otherOfferingRoles,
}: {
  buyerIntelligence: BuyerPersonIntelligence[];
  /** DISC-OFFER-P1-04.3: the same person's role under the business's other offerings. */
  otherOfferingRoles?: Map<string, OtherOfferingRole[]>;
}) {
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
              {roleLabelFor(person) ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{roleLabelFor(person)?.label}</span>
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
            <OtherOfferingRoles roles={otherOfferingRoles?.get(person.contact.id)} />
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
              <TableCell className="max-w-56">
                {roleLabelFor(person) ? (
                  <Badge variant="secondary">
                    {roleLabelFor(person)?.label}
                    {roleLabelFor(person)?.set ? <span className="sr-only"> (set for this offering)</span> : null}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
                <OtherOfferingRoles roles={otherOfferingRoles?.get(person.contact.id)} className="mt-1" />
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
