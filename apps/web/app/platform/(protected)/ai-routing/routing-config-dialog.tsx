"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Settings2 } from "lucide-react";
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
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { AiProviderRouting, listAiProviderRoutingOptions } from "@cofounderai/core/admin/platform-ai-provider-routing";
import { updateAiProviderRoutingAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

type RoutingOptions = Awaited<ReturnType<typeof listAiProviderRoutingOptions>>;

/**
 * PLATFORM-P0-09.3 (Provider Routing, config-only). One dialog edits the whole singleton
 * policy at once (default provider/model, fallback provider, and every module's own
 * override) -- there is exactly one row to change, not a list to add/remove from, so a
 * single "Configure routing" form matches the data shape more directly than per-row
 * dialogs the way `platform.ai_providers`' own fixed three-row catalog needed.
 */
export function RoutingConfigDialog({ routing, options }: { routing: AiProviderRouting; options: RoutingOptions }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const overrideByModule = new Map(routing.moduleOverrides.map((o) => [o.moduleKey, o.provider]));

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const moduleOverrides = options.modules
      .map((m) => ({ moduleKey: m.key, provider: String(formData.get(`override:${m.key}`) ?? "") }))
      .filter((entry) => entry.provider !== "") as { moduleKey: string; provider: "openai" | "anthropic" | "google" }[];

    startTransition(async () => {
      const result = await updateAiProviderRoutingAction({
        defaultProvider: String(formData.get("defaultProvider") ?? ""),
        defaultModel: String(formData.get("defaultModel") ?? ""),
        moduleOverrides,
        fallbackProvider: String(formData.get("fallbackProvider") ?? ""),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success("AI provider routing policy updated.");
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
          <DialogTitle>Configure AI provider routing</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Records routing intent only -- no AI call is actually routed by this yet. Every change is recorded
            with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultProvider" className={LABEL_CLASS}>
                Default provider
              </Label>
              <NativeSelect
                id="defaultProvider"
                name="defaultProvider"
                defaultValue={routing.defaultProvider ?? ""}
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.defaultProvider)}
              >
                <option value="">Not set</option>
                {options.providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="defaultModel" className={LABEL_CLASS}>
                Default model
              </Label>
              <Input
                id="defaultModel"
                name="defaultModel"
                defaultValue={routing.defaultModel ?? ""}
                placeholder="e.g. claude-sonnet-5"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fallbackProvider" className={LABEL_CLASS}>
              Fallback provider
            </Label>
            <NativeSelect
              id="fallbackProvider"
              name="fallbackProvider"
              defaultValue={routing.fallbackProvider ?? ""}
              className={FIELD_CLASS}
              aria-invalid={Boolean(fieldErrors.fallbackProvider)}
            >
              <option value="">Not set</option>
              {options.providers.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3">
            <p className={`text-sm ${LABEL_CLASS}`}>Module overrides</p>
            {options.modules.map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`override:${m.key}`} className="text-sm text-zinc-400">
                  {m.name}
                </Label>
                <NativeSelect
                  id={`override:${m.key}`}
                  name={`override:${m.key}`}
                  defaultValue={overrideByModule.get(m.key) ?? ""}
                  className={`${FIELD_CLASS} max-w-[55%]`}
                >
                  <option value="">Use default</option>
                  {options.providers.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Preferring Gemini for Discovery ahead of its own rollout"
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
