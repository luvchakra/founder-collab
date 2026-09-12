"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
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
import { updateAiProviderConfigAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-09.1 -- configures everything except the secret key itself (see
 * `ProviderKeyDialog` for that): enabled, the model list, default/fallback model, and the
 * two deliberately opaque `rate_limits`/`cost_controls` JSON blobs (see the migration's own
 * docstring for why no consumer enforces either yet and no specific fields are fabricated
 * here). A reason is required for every submission, matching this section's own higher
 * audit bar (PLATFORM-P0-16.2 names "AI key changes" as mandatory high-risk audit; this run
 * extends the same "every change" discipline to the registry's own config).
 */
export function ProviderConfigDialog({ provider }: { provider: AiProviderConfig }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateAiProviderConfigAction({
        provider: provider.provider,
        enabled: formData.get("enabled") === "on",
        models: String(formData.get("models") ?? ""),
        defaultModel: String(formData.get("defaultModel") ?? ""),
        fallbackModel: String(formData.get("fallbackModel") ?? ""),
        rateLimits: String(formData.get("rateLimits") ?? ""),
        costControls: String(formData.get("costControls") ?? ""),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success(`${provider.label} configuration updated.`);
      resetOnOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={resetOnOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Settings2 className="size-4" aria-hidden="true" />
          Configure
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Configure {provider.label}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Every change here is recorded with your reason. This never touches the provider&apos;s own key -- use
            &quot;Set key&quot; for that.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="enabled" defaultChecked={provider.enabled} />
            Enabled
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="models" className={LABEL_CLASS}>
              Models (comma-separated)
            </Label>
            <Input
              id="models"
              name="models"
              defaultValue={provider.models.join(", ")}
              placeholder="gpt-5.4, gpt-5.4-mini"
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultModel" className={LABEL_CLASS}>
                Default model
              </Label>
              <Input
                id="defaultModel"
                name="defaultModel"
                defaultValue={provider.defaultModel ?? ""}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.defaultModel)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fallbackModel" className={LABEL_CLASS}>
                Fallback model
              </Label>
              <Input
                id="fallbackModel"
                name="fallbackModel"
                defaultValue={provider.fallbackModel ?? ""}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.fallbackModel)}
              />
            </div>
          </div>
          {(fieldErrors.defaultModel || fieldErrors.fallbackModel) && (
            <p role="alert" className="text-xs text-red-400">
              {fieldErrors.defaultModel || fieldErrors.fallbackModel} Must appear in the models list above.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rateLimits" className={LABEL_CLASS}>
              Rate limits (JSON, optional)
            </Label>
            <Textarea
              id="rateLimits"
              name="rateLimits"
              defaultValue={Object.keys(provider.rateLimits).length ? JSON.stringify(provider.rateLimits) : ""}
              placeholder='{"requestsPerMinute": 60}'
              className={`${FIELD_CLASS} font-mono text-xs`}
              rows={2}
              aria-invalid={Boolean(fieldErrors.rateLimits)}
            />
            {fieldErrors.rateLimits ? <p role="alert" className="text-xs text-red-400">{fieldErrors.rateLimits}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="costControls" className={LABEL_CLASS}>
              Cost controls (JSON, optional)
            </Label>
            <Textarea
              id="costControls"
              name="costControls"
              defaultValue={Object.keys(provider.costControls).length ? JSON.stringify(provider.costControls) : ""}
              placeholder='{"maxCostPerRunUsd": 0.5}'
              className={`${FIELD_CLASS} font-mono text-xs`}
              rows={2}
              aria-invalid={Boolean(fieldErrors.costControls)}
            />
            {fieldErrors.costControls ? (
              <p role="alert" className="text-xs text-red-400">
                {fieldErrors.costControls}
              </p>
            ) : (
              <p className="text-xs text-zinc-500">
                Free-form -- exact fields are defined by a future cost-control/rate-limiting story.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Adding gpt-5.4-mini as a cheaper fallback"
              className={FIELD_CLASS}
              rows={2}
            />
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
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
