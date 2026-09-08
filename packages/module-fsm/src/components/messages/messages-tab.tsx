"use client";

import { useState, useTransition } from "react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { Message } from "@cofounderai/core/messages/types";

/** F-11's own Messages tab (PRD §9): "a customer reply to any reminder, estimate or
 * invoice email posts into the Messages section of that job." Read-only for the
 * inbound side (replies arrive via the shared inbound-email webhook, not typed here);
 * the compose box below is the outbound half -- staff replying to the customer. Gated
 * on `messages.manage` by the caller (job-detail's own tab list), same as every other
 * per-job action in this component. */
export function MessagesTab({ messages, canManage, sendAction }: { messages: Message[]; canManage: boolean; sendAction: (body: string, subject?: string) => Promise<void> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {messages.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-xl border p-3 ${m.direction === "inbound" ? "border-primary/30 bg-primary/5" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={m.direction === "inbound" ? "default" : "secondary"}>{m.direction === "inbound" ? "Customer" : "Sent"}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
              </div>
              {m.subject ? <p className="mt-1 text-sm font-medium">{m.subject}</p> : null}
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                await sendAction(body, subject || undefined);
                setSubject("");
                setBody("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong.");
              }
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-subject">Subject (optional)</Label>
            <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea id="msg-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} required />
          </div>
          <Button type="submit" disabled={pending} className="self-end">
            {pending ? "Sending..." : "Send"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
