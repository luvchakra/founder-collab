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
import type { AiFeaturePolicy, AiProvider } from "@cofounderai/core/admin/platform-ai-feature-policies";
import { updateAiFeaturePolicyAction } from "./actions";

// Same hardcoded-dark-chrome overrides every other `/platform` form uses.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P0-09.4 (AI Feature Policies, config-only). One dialog edits the whole singleton
 * policy at once -- there is exactly one row to change, not a list to add/remove from,
 * matching `RoutingConfigDialog`'s own precedent for the same shape of data.
 */
export function FeaturePolicyDialog({
  policy,
  providerOptions,
}: {
  policy: AiFeaturePolicy;
  providerOptions: { provider: AiProvider; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [allowedProviders, setAllowedProviders] = useState<Set<AiProvider>>(new Set(policy.allowedProviders));

  function resetOnOpen(next: boolean) {
    setOpen(next);
    setFieldErrors({});
    setReason("");
    setAllowedProviders(new Set(policy.allowedProviders));
  }

  function toggleProvider(provider: AiProvider, checked: boolean) {
    setAllowedProviders((prev) => {
      const next = new Set(prev);
      if (checked) next.add(provider);
      else next.delete(provider);
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateAiFeaturePolicyAction({
        aiEnabled: formData.get("aiEnabled") === "on",
        allowedProviders: Array.from(allowedProviders),
        allowedModels: String(formData.get("allowedModels") ?? ""),
        maxTokensPerRun: String(formData.get("maxTokensPerRun") ?? ""),
        maxRunCostUsd: String(formData.get("maxRunCostUsd") ?? ""),
        dailyPlatformBudgetUsd: String(formData.get("dailyPlatformBudgetUsd") ?? ""),
        monthlyBudgetUsd: String(formData.get("monthlyBudgetUsd") ?? ""),
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setFieldErrors({});
      toast.success("AI feature policy updated.");
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
          <DialogTitle>Configure AI feature policy</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Records ceilings only -- nothing here is enforced by any real AI call yet. Every change is recorded
            with your reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <Checkbox name="aiEnabled" defaultChecked={policy.aiEnabled} />
            AI features enabled
          </label>

          <div className="flex flex-col gap-1.5">
            <p className={`text-sm ${LABEL_CLASS}`}>Allowed providers (none = no restriction)</p>
            <div className="flex flex-wrap gap-3">
              {providerOptions.map((o) => (
                <label key={o.provider} className="flex items-center gap-2 text-sm text-zinc-300">
                  <Checkbox
                    checked={allowedProviders.has(o.provider)}
                    onCheckedChange={(checked) => toggleProvider(o.provider, checked === true)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="allowedModels" className={LABEL_CLASS}>
              Allowed models (comma-separated, empty = no restriction)
            </Label>
            <Input
              id="allowedModels"
              name="allowedModels"
              defaultValue={policy.allowedModels.join(", ")}
              placeholder="claude-sonnet-5, gpt-5.4"
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxTokensPerRun" className={LABEL_CLASS}>
                Max tokens/run
              </Label>
              <Input
                id="maxTokensPerRun"
                name="maxTokensPerRun"
                defaultValue={policy.maxTokensPerRun ?? ""}
                placeholder="No ceiling"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.maxTokensPerRun)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maxRunCostUsd" className={LABEL_CLASS}>
                Max run cost (USD)
              </Label>
              <Input
                id="maxRunCostUsd"
                name="maxRunCostUsd"
                defaultValue={policy.maxRunCostUsd ?? ""}
                placeholder="No ceiling"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.maxRunCostUsd)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dailyPlatformBudgetUsd" className={LABEL_CLASS}>
                Daily budget (USD)
              </Label>
              <Input
                id="dailyPlatformBudgetUsd"
                name="dailyPlatformBudgetUsd"
                defaultValue={policy.dailyPlatformBudgetUsd ?? ""}
                placeholder="No budget"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.dailyPlatformBudgetUsd)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monthlyBudgetUsd" className={LABEL_CLASS}>
                Monthly budget (USD)
              </Label>
              <Input
                id="monthlyBudgetUsd"
                name="monthlyBudgetUsd"
                defaultValue={policy.monthlyBudgetUsd ?? ""}
                placeholder="No budget"
                className={FIELD_CLASS}
                aria-invalid={Boolean(fieldErrors.monthlyBudgetUsd)}
              />
            </div>
          </div>
          {(fieldErrors.maxTokensPerRun ||
            fieldErrors.maxRunCostUsd ||
            fieldErrors.dailyPlatformBudgetUsd ||
            fieldErrors.monthlyBudgetUsd) && (
            <p role="alert" className="text-xs text-red-400">
              {fieldErrors.maxTokensPerRun ||
                fieldErrors.maxRunCostUsd ||
                fieldErrors.dailyPlatformBudgetUsd ||
                fieldErrors.monthlyBudgetUsd}
            </p>
          )}

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Capping run cost ahead of next week's rollout"
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
