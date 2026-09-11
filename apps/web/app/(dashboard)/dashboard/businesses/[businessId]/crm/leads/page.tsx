import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listLeads } from "@cofounderai/module-crm/lib/leads/queries";
import { listPartiesForBusiness } from "@cofounderai/core/parties/queries";
import { formatDate } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Users } from "lucide-react";
import type { LeadStatus } from "@cofounderai/module-crm/lib/leads/types";
import { updateLeadStatusAction } from "./actions";

const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "engaged",
  "qualified",
  "opportunity",
  "won",
  "lost",
  "nurture",
  "unresponsive",
  "disqualified",
];

function StatusForm({ businessId, leadId, status }: { businessId: string; leadId: string; status: LeadStatus }) {
  return (
    <form action={updateLeadStatusAction.bind(null, businessId, leadId)} className="flex items-center justify-end gap-2">
      <NativeSelect name="status" defaultValue={status} className="w-auto">
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline" pendingText="Updating...">
        Update
      </SubmitButton>
    </form>
  );
}

/**
 * CRM-04.1's Lead Lifecycle list. Status is changeable inline (the row's own edit
 * mechanism, per docs/design/claude-ui-design-rules.md rule 4) via the same
 * SubmitButton-driven form pattern the prospect detail page's own status control
 * already uses. Desktop gets a real table (rule 5/6: comparable records, aligned
 * columns, actions on the right); below `md` the same rows render as cards instead of a
 * cropped or side-scrolling table (CLAUDE.md rule 12).
 */
export default async function CrmLeadsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [leads, parties] = await Promise.all([listLeads(businessId), listPartiesForBusiness(businessId)]);
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every relationship {business.name} is tracking, from first contact to opportunity.</p>
      </div>

      {leads.length === 0 ? (
        <EmptyState icon={Users} message="No leads yet. Leads are created manually or promoted from a Discovery prospect." />
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {leads.map((lead) => (
              <li key={lead.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <Link href={`/dashboard/businesses/${businessId}/crm/customers/${lead.party_id}`} className="min-w-0 font-medium break-words hover:underline">
                    {partyNameById.get(lead.party_id) ?? "Unknown contact"}
                  </Link>
                  <Badge variant="outline" className="shrink-0">
                    {lead.source}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Created {formatDate(lead.created_at)}</p>
                <StatusForm businessId={businessId} leadId={lead.id} status={lead.status} />
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/businesses/${businessId}/crm/customers/${lead.party_id}`} className="hover:underline">
                      {partyNameById.get(lead.party_id) ?? "Unknown contact"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{lead.source}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <StatusForm businessId={businessId} leadId={lead.id} status={lead.status} />
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
