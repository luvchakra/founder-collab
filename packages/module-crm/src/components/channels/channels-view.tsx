"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { Channel, ChannelKind } from "../../lib/channels/types";

const CHANNEL_KIND_LABEL: Record<ChannelKind, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  social: "Social",
};

/** S-1's own skeleton screen (docs/plan/04-CLAUDE-CODE-BACKLOG.md's own "placeholder
 * screens behind the license"): create + toggle-active only, structure over
 * StockPilot-style CRUD polish -- the real unified-inbox feature (a channel actually
 * receiving messages) is a later story. */
export function ChannelsView({
  channels,
  createAction,
  setActiveAction,
}: {
  channels: Channel[];
  createAction: (kind: ChannelKind, name: string) => Promise<void>;
  setActiveAction: (id: string, isActive: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ChannelKind>("email");
  const [name, setName] = useState("");

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

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            await createAction(kind, name);
            setName("");
          });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="channel-kind">Kind</Label>
          <NativeSelect id="channel-kind" value={kind} onChange={(e) => setKind(e.target.value as ChannelKind)}>
            {Object.entries(CHANNEL_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-1 min-w-40 flex-col gap-1.5">
          <Label htmlFor="channel-name">Name</Label>
          <Input id="channel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support inbox" required />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Add channel
        </Button>
      </form>

      {channels.length === 0 ? (
        <EmptyState variant="inline" message="No channels yet. Add one above." />
      ) : (
        <div className="rounded-2xl border border-border">
          {/* Compact cards below md -- a 4-column table with a bare icon-only action
              column doesn't fit a phone width, per this platform's own mobile-card
              rule for any page whose primary content is a table of rows. */}
          <ul className="divide-y md:hidden">
            {channels.map((channel) => (
              <li key={channel.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{channel.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{CHANNEL_KIND_LABEL[channel.kind]}</span>
                    <Badge variant={channel.is_active ? "secondary" : "outline"}>
                      {channel.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => setActiveAction(channel.id, !channel.is_active))}
                >
                  {channel.is_active ? "Deactivate" : "Reactivate"}
                </Button>
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="font-medium">{channel.name}</TableCell>
                  <TableCell className="text-muted-foreground">{CHANNEL_KIND_LABEL[channel.kind]}</TableCell>
                  <TableCell>
                    <Badge variant={channel.is_active ? "secondary" : "outline"}>{channel.is_active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => setActiveAction(channel.id, !channel.is_active))}
                    >
                      {channel.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
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
