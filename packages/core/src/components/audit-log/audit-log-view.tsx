"use client";

import { History } from "lucide-react";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { NativeSelect } from "../ui/native-select";
import { EmptyState } from "../ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { formatDateTime } from "../../lib/format";
import { ACTION_LABEL, ENTITY_TYPE_LABEL, describeAuditChange } from "../../audit/format";
import type { AuditActor } from "../../audit/queries";
import type { AuditLogEntry } from "../../audit/types";

/**
 * Read-only, filterable audit trail -- ported from stockpilot-ai-ops's audit-log.tsx,
 * rebuilt as a plain GET form (same convention as GST Filing's period picker) instead of
 * client-side react-query state, since this platform's server components already fetch
 * filtered data on every navigation.
 */
export function AuditLogView({
  entries,
  actors,
  filters,
}: {
  entries: AuditLogEntry[];
  actors: AuditActor[];
  filters: { entityType: string; actorId: string; dateFrom: string; dateTo: string };
}) {
  const actorNameById = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entityType" className="text-xs text-muted-foreground">
            Entity
          </Label>
          <NativeSelect
            id="entityType"
            name="entityType"
            defaultValue={filters.entityType}
            className="w-48"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="">All entities</option>
            {Object.entries(ENTITY_TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="actorId" className="text-xs text-muted-foreground">
            Actor
          </Label>
          <NativeSelect
            id="actorId"
            name="actorId"
            defaultValue={filters.actorId}
            className="w-48"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="">All members</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={filters.dateFrom}
            className="w-40"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateTo" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={filters.dateTo}
            className="w-40"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
        </div>
      </form>

      {entries.length === 0 ? (
        <EmptyState icon={History} message="No audit entries match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {(row.actor_id && actorNameById.get(row.actor_id)) ?? row.actor_id ?? "System"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ENTITY_TYPE_LABEL[row.entity_type] ?? row.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {ACTION_LABEL[row.action] ?? row.action}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                    {describeAuditChange(row)}
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
