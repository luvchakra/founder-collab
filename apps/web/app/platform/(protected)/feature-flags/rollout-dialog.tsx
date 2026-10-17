"use client";

import { useState, useTransition } from "react";
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
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { FeatureFlag } from "@cofounderai/core/admin/platform-feature-flags";
import {
  ROLLOUT_STAGES,
  ROLLOUT_STAGE_LABELS,
  isLaterStage,
  rolloutSummary,
  type RolloutStage,
} from "@cofounderai/core/admin/platform-feature-rollout-rules";
import { rollbackFeatureFlagAction, setFeatureFlagRolloutAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const LABEL_CLASS = "text-zinc-300";

/**
 * PLATFORM-P1-08.2 (staged rollout) and PLATFORM-P1-08.3 (rollback) -- one dialog per
 * flag, opened from the flag's rollout summary. Save sets or advances the stage; Roll back
 * restores the last known-good rollout, or turns the flag off when none is saved. Both
 * need the reason, which goes to the flag's history.
 */
export function RolloutDialog({ flag, plans }: { flag: FeatureFlag; plans: { key: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<RolloutStage>(flag.rollout.stage);
  const [percentage, setPercentage] = useState(String(flag.rollout.percentage));
  const [slugs, setSlugs] = useState(flag.rolloutBusinessSlugs.join("\n"));
  const [planKeys, setPlanKeys] = useState<string[]>(flag.rollout.planKeys);
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset(next: boolean) {
    setOpen(next);
    setStage(flag.rollout.stage);
    setPercentage(String(flag.rollout.percentage));
    setSlugs(flag.rolloutBusinessSlugs.join("\n"));
    setPlanKeys(flag.rollout.planKeys);
    setReason("");
    setFieldErrors({});
  }

  function save() {
    startTransition(async () => {
      const result = await setFeatureFlagRolloutAction({
        id: flag.id,
        stage,
        percentage,
        businessSlugs: slugs,
        planKeys,
        reason,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      toast.success(`Rollout saved: ${ROLLOUT_STAGE_LABELS[stage]}.`);
      reset(false);
    });
  }

  function rollback() {
    startTransition(async () => {
      const result = await rollbackFeatureFlagAction({ id: flag.id, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        flag.lastGoodRollout
          ? `Rolled back to ${ROLLOUT_STAGE_LABELS[flag.lastGoodRollout.stage]}.`
          : `"${flag.featureKey}" turned off.`,
      );
      reset(false);
    });
  }

  const canRollBack = Boolean(flag.lastGoodRollout) || flag.enabled;
  const rollbackLabel = flag.lastGoodRollout
    ? `Roll back to ${ROLLOUT_STAGE_LABELS[flag.lastGoodRollout.stage]}`
    : "Roll back: turn off";
  const advancing = isLaterStage(stage, flag.rollout.stage);
  const noReason = reason.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto px-2 py-1 text-left text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          aria-label={`Rollout for ${flag.featureKey}`}
        >
          {rolloutSummary(flag.rollout)}
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Rollout for &quot;{flag.featureKey}&quot;</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Each stage adds to the one before. Named businesses always get it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rollout-stage" className={LABEL_CLASS}>
              Stage
            </Label>
            <NativeSelect
              id="rollout-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value as RolloutStage)}
              className={FIELD_CLASS}
            >
              {ROLLOUT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {ROLLOUT_STAGE_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {stage !== "all" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rollout-businesses" className={LABEL_CLASS}>
                Named businesses
              </Label>
              <Textarea
                id="rollout-businesses"
                value={slugs}
                onChange={(e) => setSlugs(e.target.value)}
                placeholder="business-slug, one per line"
                className={FIELD_CLASS}
                rows={3}
                aria-invalid={Boolean(fieldErrors.businessSlugs)}
              />
              {fieldErrors.businessSlugs ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.businessSlugs}
                </p>
              ) : null}
            </div>
          ) : null}

          {stage === "pilot" || stage === "selected_plans" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rollout-percentage" className={LABEL_CLASS}>
                Share of all businesses (%)
              </Label>
              <Input
                id="rollout-percentage"
                type="number"
                min={0}
                max={100}
                step={1}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className={`${FIELD_CLASS} w-28`}
                aria-invalid={Boolean(fieldErrors.percentage)}
              />
              <p className={fieldErrors.percentage ? "text-xs text-red-400" : "text-xs text-zinc-500"}>
                {fieldErrors.percentage ?? "Raising it keeps every business already in."}
              </p>
            </div>
          ) : null}

          {stage === "selected_plans" ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium text-zinc-300">Plans</legend>
              {plans.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-zinc-300">
                  <Checkbox
                    checked={planKeys.includes(p.key)}
                    onCheckedChange={(checked) =>
                      setPlanKeys((keys) => (checked ? [...keys, p.key] : keys.filter((k) => k !== p.key)))
                    }
                  />
                  {p.name}
                </label>
              ))}
              {fieldErrors.planKeys ? (
                <p role="alert" className="text-xs text-red-400">
                  {fieldErrors.planKeys}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-3">
            <Label htmlFor="rollout-reason" className={LABEL_CLASS}>
              Reason (required)
            </Label>
            <Textarea
              id="rollout-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. No errors in a week of pilot"
              className={FIELD_CLASS}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {canRollBack ? (
            <Button
              type="button"
              variant="ghost"
              className="text-red-400 hover:bg-zinc-800 hover:text-red-300"
              disabled={pending || noReason}
              onClick={rollback}
            >
              {rollbackLabel}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" disabled={pending || noReason} onClick={save}>
            {pending ? "Saving…" : advancing ? `Advance to ${ROLLOUT_STAGE_LABELS[stage]}` : "Save rollout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
