"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  businessSlug,
  tickets,
  channels,
  employees,
  createAction,
  updateStatusAction,
  assignAction,
  convertToProspectAction,
}: {
  businessSlug: string;
  tickets: Ticket[];
  channels: Channel[];
  employees: EmployeeOption[];
  createAction: (subject: string, channelId?: string) => Promise<void>;
  updateStatusAction: (ticketId: string, status: TicketStatus) => Promise<void>;
  assignAction: (ticketId: string, employeeId: string | null) => Promise<void>;
  /** docs/design/crm-module-design.md Part A, A4 -- only offered on tickets an
   * inbound-channel webhook actually created (external_sender_handle set); manually
   * created tickets have no external lead to convert. */
  convertToProspectAction: (ticketId: string) => Promise<{ error: string } | { success: true }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [converted, setConverted] = useState<Set<string>>(new Set());
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

  function runConvert(ticketId: string) {
    setError(null);
    startTransition(async () => {
      const result = await convertToProspectAction(ticketId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setConverted((prev) => new Set(prev).add(ticketId));
    });
  }

  const channelById = new Map(channels.map((c) => [c.id, c]));

  function statusSelect(ticket: Ticket, className: string) {
    return (
      <NativeSelect
        className={className}
        value={ticket.status}
        disabled={pending}
        aria-label={`Status for ${ticket.subject || "ticket"}`}
        onChange={(e) => run(() => updateStatusAction(ticket.id, e.target.value as TicketStatus))}
      >
        <option value="open">Open</option>
        <option value="pending">Pending</option>
        <option value="closed">Closed</option>
      </NativeSelect>
    );
  }

  function assignSelect(ticket: Ticket, className: string) {
    return (
      <NativeSelect
        className={className}
        value={ticket.assigned_to ?? ""}
        disabled={pending}
        aria-label={`Assignee for ${ticket.subject || "ticket"}`}
        onChange={(e) => run(() => assignAction(ticket.id, e.target.value || null))}
      >
        <option value="">Unassigned</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.full_name ?? e.email ?? "Unnamed"}
          </option>
        ))}
      </NativeSelect>
    );
  }

  function rowActions(ticket: Ticket) {
    return (
      <>
        {ticket.party_id ? (
          <Link
            href={`/${businessSlug}/crm/customers/${ticket.party_id}?ticketId=${ticket.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Customer 360
          </Link>
        ) : null}
        {ticket.external_sender_handle ? (
          converted.has(ticket.id) ? (
            <Badge variant="secondary">Converted</Badge>
          ) : (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => runConvert(ticket.id)}>
              Convert to prospect
            </Button>
          )
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
        <p className="text-sm font-medium">New ticket</p>
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
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input id="ticket-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ticket-channel">Channel</Label>
            <NativeSelect id="ticket-channel" className="w-40" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">No channel</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={pending}>
            Create ticket
          </Button>
        </form>
      </div>

      {tickets.length === 0 ? (
        <EmptyState variant="inline" message="No tickets yet." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          {/* Compact cards below md, per this platform's own rule that a table of rows
              never scrolls horizontally or gets cramped on a small screen. */}
          <div className="divide-y divide-border md:hidden">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium">{ticket.subject || "(no subject)"}</p>
                  <Badge variant={STATUS_VARIANT[ticket.status]} className="shrink-0 capitalize">
                    {ticket.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ticket.channel_id ? channelById.get(ticket.channel_id)?.name ?? "—" : "No channel"} &middot;{" "}
                  {formatDateTime(ticket.created_at)}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Status</span>
                    {statusSelect(ticket, "h-9 w-full")}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Assigned to</span>
                    {assignSelect(ticket, "h-9 w-full")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">{rowActions(ticket)}</div>
              </div>
            ))}
          </div>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">{ticket.subject || "(no subject)"}</TableCell>
                  <TableCell className="text-muted-foreground">{ticket.channel_id ? channelById.get(ticket.channel_id)?.name ?? "—" : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusSelect(ticket, "h-8 w-28")}
                      <Badge variant={STATUS_VARIANT[ticket.status]} className="hidden lg:inline-flex">
                        {ticket.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{assignSelect(ticket, "h-8 w-36")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(ticket.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">{rowActions(ticket)}</div>
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
