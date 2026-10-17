"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import type { Channel } from "../../lib/channels/types";
import { CHANNEL_PROVIDER_LABELS, type ChannelAccount, type ChannelProvider, type InstantReplyMode } from "../../lib/channel-accounts/types";
// CRM-INSTANT-ACK-01: only the options that do something. "AI drafts, human approves" is
// gone -- nothing drafted on ingest; drafting is "Draft with AI" in Conversations.
import {
  ACK_SUPPORTED_PROVIDERS,
  INSTANT_REPLY_MODE_LABELS as INSTANT_REPLY_LABELS,
  OFFERED_INSTANT_REPLY_MODES,
} from "../../lib/instant-reply/acknowledgement";

function supportsAck(provider: ChannelProvider): boolean {
  return (ACK_SUPPORTED_PROVIDERS as readonly string[]).includes(provider);
}

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
  ackText,
  saveAckTextAction,
  whatsappHref,
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
  /** CRM-INSTANT-ACK-01: the business's acknowledgement text (or the default). */
  ackText: string;
  saveAckTextAction: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  whatsappHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [provider, setProvider] = useState<ChannelProvider>("whatsapp_business");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [draftAck, setDraftAck] = useState(ackText);
  const [ackSaved, setAckSaved] = useState(false);

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

  // CRM-INSTANT-ACK-01: a select only where the acknowledgement can actually be sent.
  function instantReplyControl(account: ChannelAccount) {
    if (account.provider === "whatsapp_business") {
      return (
        <a href={whatsappHref} className="text-sm text-muted-foreground underline">
          Set on the WhatsApp page
        </a>
      );
    }
    if (!supportsAck(account.provider)) return <span className="text-sm text-muted-foreground">Not supported yet</span>;
    return (
      <NativeSelect
        aria-label="Instant reply"
        value={account.instant_reply_mode === "instant_ack_then_human" ? "instant_ack_then_human" : "off"}
        disabled={pending || account.status !== "connected"}
        onChange={(e) => run(() => setInstantReplyModeAction(account.id, e.target.value as InstantReplyMode))}
      >
        {OFFERED_INSTANT_REPLY_MODES.map((value) => (
          <option key={value} value={value}>
            {INSTANT_REPLY_LABELS[value]}
          </option>
        ))}
      </NativeSelect>
    );
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4">
      <div>
        <h2 className="font-medium">Connected accounts</h2>
        <p className="text-sm text-muted-foreground">
          WhatsApp/Instagram/Facebook/Google Business Messages accounts that actually
          send and receive through a channel above.
        </p>
        <p className="text-sm text-muted-foreground">Basic for now — more instant-reply options are coming.</p>
      </div>

      <Collapsible className="rounded-2xl border border-border p-3">
        <CollapsibleTrigger className="text-sm font-medium">Acknowledgement message</CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-3">
          <p className="text-xs text-muted-foreground">
            Sent once, automatically, the first time a contact messages in 24 hours, on accounts set to instant acknowledgment.
          </p>
          <Label htmlFor="instant-ack-text" className="sr-only">
            Acknowledgement message
          </Label>
          <Textarea
            id="instant-ack-text"
            value={draftAck}
            maxLength={500}
            rows={2}
            onChange={(e) => {
              setDraftAck(e.target.value);
              setAckSaved(false);
            }}
          />
          <div className="flex items-center justify-end gap-3">
            {ackSaved ? <span className="text-xs text-muted-foreground">Saved.</span> : null}
            <Button
              size="sm"
              variant="outline"
              disabled={pending || draftAck.trim() === ackText.trim()}
              onClick={() =>
                run(async () => {
                  const result = await saveAckTextAction(draftAck);
                  if (!result.ok) throw new Error(result.error);
                  setAckSaved(true);
                })
              }
            >
              Save message
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a channel above before connecting an account to it.</p>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border p-4"
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
          <div className="flex flex-1 min-w-40 flex-col gap-1.5">
            <Label htmlFor="account-external-id">Page/number/location ID</Label>
            <Input
              id="account-external-id"
              value={externalAccountId}
              onChange={(e) => setExternalAccountId(e.target.value)}
              placeholder="e.g. phone_number_id"
              required
            />
          </div>
          <div className="flex flex-1 min-w-40 flex-col gap-1.5">
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
        <div className="rounded-2xl border border-border">
          {/* Compact cards below md -- the desktop table below has 5 columns
              including two inline controls, which does not fit a phone width. */}
          <ul className="divide-y md:hidden">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{CHANNEL_PROVIDER_LABELS[account.provider]}</p>
                    <p className="truncate text-xs text-muted-foreground">{account.external_account_id}</p>
                  </div>
                  <Badge variant={account.status === "connected" ? "secondary" : "outline"} className="shrink-0">
                    {account.status}
                  </Badge>
                </div>
                {instantReplyControl(account)}
                {account.status === "connected" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    className="self-end"
                    onClick={() => run(() => disconnectAction(account.id))}
                  >
                    Disconnect
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>External ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Instant reply</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{CHANNEL_PROVIDER_LABELS[account.provider]}</TableCell>
                  <TableCell className="text-muted-foreground">{account.external_account_id}</TableCell>
                  <TableCell>
                    <Badge variant={account.status === "connected" ? "secondary" : "outline"}>{account.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {instantReplyControl(account)}
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
        </div>
      )}
    </div>
  );
}
