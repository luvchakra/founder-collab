"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Badge } from "@cofounderai/core/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@cofounderai/core/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { ApiKeySummary } from "@cofounderai/core/api-v1/keys/types";

/** Ported from stockpilot-ai-ops's src/components/api-keys-panel.tsx -- generate/revoke
 * go through plain Server Actions + useTransition (this codebase's own established
 * pattern, e.g. alerts-list.tsx) instead of a react-query mutation, since Next.js server
 * actions can be called directly and awaited from a Client Component. */
export function ApiKeysPanel({
  keys,
  generateAction,
  revokeAction,
}: {
  keys: ApiKeySummary[];
  generateAction: (name: string) => Promise<{ id: string; rawKey: string }>;
  revokeAction: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateAction(name.trim());
        setFormOpen(false);
        setName("");
        setRevealedKey(result.rawKey);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create API key.");
      }
    });
  };

  const submitRevoke = (id: string) => {
    setError(null);
    startTransition(async () => {
      try {
        await revokeAction(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not revoke API key.");
      }
    });
  };

  const copyKey = async () => {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        API keys authenticate requests to the{" "}
        <a href="/api/v1/openapi.json" className="underline" target="_blank" rel="noreferrer">
          public REST API
        </a>{" "}
        (<code>Authorization: Bearer sk_live_...</code>). A key can only do what your role could do in the
        app at the moment it was created — reissue it after a role change to pick up new access. The full
        key is shown once, right after you create it.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {keys.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{k.key_prefix}…</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(k.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}
                  </TableCell>
                  <TableCell>
                    {k.revoked_at ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : (
                      <Badge variant="secondary">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!k.revoked_at ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={pending}
                          >
                            Revoke
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke &quot;{k.name}&quot;?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Any integration still using this key will immediately stop working. This
                              cannot be undone -- a revoked key can never be reactivated, only replaced
                              with a new one.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep key</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => submitRevoke(k.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No API keys yet.
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New API key
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitGenerate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="api-key-name">Name</Label>
              <Input
                id="api-key-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Zapier integration"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedKey} onOpenChange={(v) => !v && setRevealedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4" aria-hidden="true" />
              Your new API key
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-warning">Copy this now — for your security, it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-xs">{revealedKey}</code>
            <Button type="button" variant="ghost" size="icon" onClick={() => void copyKey()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
