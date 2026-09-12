"use client";

import { useState, useTransition, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { AiProviderConfig } from "@cofounderai/core/admin/platform-ai-providers";
import { setAiProviderKeyAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-09.2 ("Secure API Key Storage") -- the ONLY place a plaintext key is ever
 * typed. It is tested against the real provider server-side before anything is saved (a
 * rejected key is never persisted, see `setAiProviderKey()`'s own docstring) and is never
 * echoed back anywhere: this dialog always opens blank, never pre-filled with anything
 * resembling the stored key, whether setting a key for the first time or rotating an
 * existing one.
 */
export function ProviderKeyDialog({ provider }: { provider: AiProviderConfig }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setError(null);
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await setAiProviderKeyAction({
        provider: provider.provider,
        apiKey: String(formData.get("apiKey") ?? ""),
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      toast.success(`${provider.label} key ${provider.configured ? "rotated" : "connected"}.`);
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <KeyRound className="size-4" aria-hidden="true" />
          {provider.configured ? "Rotate key" : "Set key"}
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>
            {provider.configured ? "Rotate" : "Set"} {provider.label}&apos;s key
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Validated against {provider.label} before it&apos;s saved. Stored encrypted -- nobody, including a
            SUPERADMIN, can read it back out through this UI once saved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="apiKey" className={LABEL_CLASS}>
              API key
            </Label>
            <Input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={provider.configured ? `Currently ••••••••••••${provider.keyFingerprint}` : "sk-..."}
              className={FIELD_CLASS}
              aria-invalid={Boolean(error)}
            />
            {error ? (
              <p role="alert" className="text-xs text-red-400">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="key-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="key-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Connecting the platform's own included-credit key"
              className={FIELD_CLASS}
              rows={2}
            />
            <p className="text-xs text-zinc-500">Every key change is recorded with this reason.</p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              onClick={() => resetOnOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Validating…" : provider.configured ? "Rotate key" : "Save key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
