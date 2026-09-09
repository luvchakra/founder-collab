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
import { CHANNEL_PROVIDER_LABELS, type ChannelAccount, type ChannelProvider, type InstantReplyMode } from "../../lib/channel-accounts/types";

const INSTANT_REPLY_LABELS: Record<InstantReplyMode, string> = {
  off: "Off (manual only)",
  draft_approve: "AI drafts, human approves",
  instant_ack_then_human: "Instant acknowledgment, then human",
};

/**
 * docs/design/crm-module-design.md Part A, A1/A3: connecting an external account and
 * setting its instant-reply mode. The actual Meta/Google OAuth exchange (getting a
 * real access token to paste in below) happens outside this app -- see
 * channel-accounts/mutations.ts#connectChannelAccount's own doc comment on that split.
 */
export function ChannelAccountsPanel({
  channels,
  accounts,
  connectAction,
  disconnectAction,
  setInstantReplyModeAction,
}: {
  channels: Channel[];
  accounts: ChannelAccount[];
  connectAction: (input: {
    channelId: string;
    provider: ChannelProvider;
    externalAccountId: string;
    accessToken: string;
    refreshToken?: string;
  }) => Promise<void>;
  disconnectAction: (channelAccountId: string) => Promise<void>;
  setInstantReplyModeAction: (channelAccountId: string, mode: InstantReplyMode) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [provider, setProvider] = useState<ChannelProvider>("whatsapp_business");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");

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
    <div className="flex flex-col gap-4 border-t pt-4">
      <div>
        <h2 className="font-medium">Connected accounts</h2>
        <p className="text-sm text-muted-foreground">
          WhatsApp/Instagram/Facebook/Google Business Messages accounts that actually
          send and receive through a channel above.
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a channel above before connecting an account to it.</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await connectAction({ channelId, provider, externalAccountId, accessToken });
              setExternalAccountId("");
              setAccessToken("");
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-channel">Channel</Label>
            <NativeSelect id="account-channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-provider">Provider</Label>
            <NativeSelect id="account-provider" value={provider} onChange={(e) => setProvider(e.target.value as ChannelProvider)}>
              {Object.entries(CHANNEL_PROVIDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-external-id">Page/number/location ID</Label>
            <Input
              id="account-external-id"
              value={externalAccountId}
              onChange={(e) => setExternalAccountId(e.target.value)}
              placeholder="e.g. phone_number_id"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-token">Access token</Label>
            <Input
              id="account-token"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="From the provider's OAuth exchange"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Connect
          </Button>
        </form>
      )}

      {accounts.length === 0 ? (
        <EmptyState variant="inline" message="No accounts connected yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Instant reply</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{CHANNEL_PROVIDER_LABELS[account.provider]}</TableCell>
                <TableCell className="text-muted-foreground">{account.external_account_id}</TableCell>
                <TableCell>
                  <Badge variant={account.status === "connected" ? "secondary" : "outline"}>{account.status}</Badge>
                </TableCell>
                <TableCell>
                  <NativeSelect
                    value={account.instant_reply_mode}
                    disabled={pending || account.status !== "connected"}
                    onChange={(e) => run(() => setInstantReplyModeAction(account.id, e.target.value as InstantReplyMode))}
                  >
                    {Object.entries(INSTANT_REPLY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                </TableCell>
                <TableCell className="text-right">
                  {account.status === "connected" ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => disconnectAction(account.id))}>
                      Disconnect
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
