"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { Channel } from "../../lib/channels/types";
import type { EmployeeOption, Ticket, TicketStatus } from "../../lib/tickets/types";

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  pending: "secondary",
  closed: "outline",
};

/** S-1's own skeleton screen: a manually-created ticket list, not the real unified
 * inbox (no message thread view, no automatic ticket-from-message ingestion -- that
 * reads `core.messages`/`core.threads` and is a later story's own scope, per
 * 00-MASTER-PLAN.md §5's "message.received | core | crm (triage)" event row). */
export function InboxView({
  tickets,
  channels,
  employees,
  createAction,
  updateStatusAction,
  assignAction,
}: {
  tickets: Ticket[];
  channels: Channel[];
  employees: EmployeeOption[];
  createAction: (subject: string, channelId?: string) => Promise<void>;
  updateStatusAction: (ticketId: string, status: TicketStatus) => Promise<void>;
  assignAction: (ticketId: string, employeeId: string | null) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [channelId, setChannelId] = useState("");

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const channelById = new Map(channels.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await createAction(subject, channelId || undefined);
            setSubject("");
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-subject">New ticket</Label>
          <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ticket-channel">Channel</Label>
          <NativeSelect id="ticket-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">No channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Create ticket
        </Button>
      </form>

      {tickets.length === 0 ? (
        <EmptyState variant="inline" message="No tickets yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned to</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((ticket) => (
              <TableRow key={ticket.id}>
                <TableCell>{ticket.subject || "(no subject)"}</TableCell>
                <TableCell className="text-muted-foreground">{ticket.channel_id ? channelById.get(ticket.channel_id)?.name ?? "—" : "—"}</TableCell>
                <TableCell>
                  <NativeSelect
                    className="h-8 w-28"
                    value={ticket.status}
                    disabled={pending}
                    onChange={(e) => run(() => updateStatusAction(ticket.id, e.target.value as TicketStatus))}
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                  </NativeSelect>
                  <Badge variant={STATUS_VARIANT[ticket.status]} className="ml-2 hidden sm:inline-flex">
                    {ticket.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <NativeSelect
                    className="h-8 w-36"
                    value={ticket.assigned_to ?? ""}
                    disabled={pending}
                    onChange={(e) => run(() => assignAction(ticket.id, e.target.value || null))}
                  >
                    <option value="">Unassigned</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name ?? e.email ?? "Unnamed"}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(ticket.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
