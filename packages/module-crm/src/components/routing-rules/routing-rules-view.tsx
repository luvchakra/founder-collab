"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { Channel } from "../../lib/channels/types";
import type { RoutingRule, EmployeeOption, KnownSenderCondition } from "../../lib/routing-rules/types";

const KNOWN_SENDER_LABELS: Record<KnownSenderCondition, string> = {
  any: "Anyone",
  known: "Known senders only",
  new: "New senders only",
};

/**
 * S-1's own skeleton screen, extended by B3 (docs/design/crm-module-design.md Part
 * B) with the two conditions ingest-inbound-message.ts's matchRoutingRule() actually
 * evaluates against a real inbound message: known-vs-new sender and business hours.
 */
export function RoutingRulesView({
  rules,
  channels,
  employees,
  createAction,
  setActiveAction,
}: {
  rules: RoutingRule[];
  channels: Channel[];
  employees: EmployeeOption[];
  createAction: (
    name: string,
    channelId: string,
    employeeId: string,
    priority: number,
    conditionKnownSender: KnownSenderCondition,
    businessHoursStart: string,
    businessHoursEnd: string,
  ) => Promise<void>;
  setActiveAction: (id: string, isActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [priority, setPriority] = useState("0");
  const [conditionKnownSender, setConditionKnownSender] = useState<KnownSenderCondition>("any");
  const [businessHoursStart, setBusinessHoursStart] = useState("");
  const [businessHoursEnd, setBusinessHoursEnd] = useState("");

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
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await createAction(name, channelId, employeeId, Number(priority) || 0, conditionKnownSender, businessHoursStart, businessHoursEnd);
            setName("");
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-name">Name</Label>
          <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WhatsApp to support" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-channel">Channel</Label>
          <NativeSelect id="rule-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="">Any channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-employee">Assign to</Label>
          <NativeSelect id="rule-employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name ?? e.email ?? "Unnamed"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-priority">Priority</Label>
          <Input id="rule-priority" type="number" className="w-20" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-known-sender">Sender</Label>
          <NativeSelect
            id="rule-known-sender"
            value={conditionKnownSender}
            onChange={(e) => setConditionKnownSender(e.target.value as KnownSenderCondition)}
          >
            {Object.entries(KNOWN_SENDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rule-hours-start">Business hours (optional)</Label>
          <div className="flex items-center gap-1">
            <Input
              id="rule-hours-start"
              type="time"
              className="w-28"
              value={businessHoursStart}
              onChange={(e) => setBusinessHoursStart(e.target.value)}
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="time"
              className="w-28"
              value={businessHoursEnd}
              onChange={(e) => setBusinessHoursEnd(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Add rule
        </Button>
      </form>

      {rules.length === 0 ? (
        <EmptyState variant="inline" message="No routing rules yet. Add one above." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Assign to</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{rule.name}</TableCell>
                <TableCell className="text-muted-foreground">{rule.channel_id ? channelById.get(rule.channel_id)?.name ?? "—" : "Any"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {rule.assign_to_employee_id
                    ? employeeById.get(rule.assign_to_employee_id)?.full_name ?? employeeById.get(rule.assign_to_employee_id)?.email ?? "—"
                    : "Unassigned"}
                </TableCell>
                <TableCell className="text-muted-foreground">{rule.priority}</TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex flex-wrap gap-1">
                    {rule.condition_known_sender !== "any" ? (
                      <Badge variant="outline">{KNOWN_SENDER_LABELS[rule.condition_known_sender]}</Badge>
                    ) : null}
                    {rule.business_hours_start && rule.business_hours_end ? (
                      <Badge variant="outline">
                        {rule.business_hours_start.slice(0, 5)}-{rule.business_hours_end.slice(0, 5)}
                      </Badge>
                    ) : null}
                    {rule.condition_known_sender === "any" && !rule.business_hours_start ? "—" : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={rule.is_active ? "secondary" : "outline"}>{rule.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setActiveAction(rule.id, !rule.is_active))}>
                    {rule.is_active ? "Deactivate" : "Reactivate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
