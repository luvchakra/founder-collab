import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";
import type { FsmCustomer } from "../../lib/customers/types";

/** Read-only (PRD §5's route description is a list, not a management screen -- fsm
 * never creates a customer independently, only via `resolveCustomerPartyId()` when an
 * opportunity/job is created; editing the underlying `core.parties` row is inventory's
 * customer screen's job, same row, when both modules are licensed). */
export function CustomersList({ customers }: { customers: FsmCustomer[] }) {
  if (customers.length === 0) {
    return <p className="text-sm text-muted-foreground">No customers yet -- creating an opportunity or job adds one automatically.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Open jobs</TableHead>
            <TableHead>Open opportunities</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Since</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell>{c.email ?? "-"}</TableCell>
              <TableCell>{c.phone ?? "-"}</TableCell>
              <TableCell>{c.open_job_count}</TableCell>
              <TableCell>{c.open_opportunity_count}</TableCell>
              <TableCell>
                <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "Active" : "Inactive"}</Badge>
              </TableCell>
              <TableCell>{formatDate(c.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
