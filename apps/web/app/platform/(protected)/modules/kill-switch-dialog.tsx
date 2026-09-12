"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@cofounderai/core/ui/alert";
import { Badge } from "@cofounderai/core/ui/badge";
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
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { getModuleImpactAction, setModuleEnabledAction } from "./actions";

/**
 * PLATFORM-P0-07.2 ("Platform-Wide Module Kill Switch") -- the one place `enabled` is
 * ever changed from the UI. §11 names four requirements; each has a concrete control
 * here:
 *   - **reason**: the required `Textarea` below -- the confirm button stays disabled
 *     until it's non-empty (mirrors the server-side check in
 *     `platform.set_module_enabled()`, which also rejects an empty reason, so this is
 *     genuine UX, not the only enforcement).
 *   - **impact confirmation**: the real, live count of businesses currently licensing
 *     this module (`getModuleImpactAction()`, fetched fresh each time the dialog opens --
 *     never cached/stale, since the whole point is showing current reality before a
 *     dangerous action), shown before the operator can act.
 *   - **explicit confirmation**: a separate acknowledgement `Checkbox` the operator must
 *     tick -- reading the impact count is not itself the confirmation.
 *   - **audit record**: not this component's concern directly -- `setModuleEnabled()`
 *     calls the one RPC (`platform.set_module_enabled()`) that writes
 *     `platform.module_kill_switch_events` atomically with the flip itself.
 *
 * Disabling and re-enabling share this same dialog (only the copy/button color changes)
 * -- both are real state changes worth a reason and a confirmation, not just the
 * "disable" direction.
 */
export function KillSwitchDialog({
  moduleKey,
  moduleName,
  enabled,
  onChanged,
}: {
  moduleKey: string;
  moduleName: string;
  enabled: boolean;
  /** Called with the new `enabled` value after a successful change, so the parent table's
   * own row state (a separate `useState` copy, per its own "local optimistic state"
   * pattern) reflects it immediately without waiting on a full page revalidation. */
  onChanged: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [impact, setImpact] = useState<number | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [isPending, startTransition] = useTransition();

  const nextEnabled = !enabled;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setReason("");
      setAcknowledged(false);
      setImpact(null);
      setLoadingImpact(true);
      getModuleImpactAction(moduleKey)
        .then((result) => setImpact(result.affectedBusinessCount))
        .catch(() => setImpact(null))
        .finally(() => setLoadingImpact(false));
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await setModuleEnabledAction({ moduleKey, enabled: nextEnabled, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${moduleName} ${nextEnabled ? "re-enabled" : "disabled"} platform-wide.`);
      onChanged(nextEnabled);
      setOpen(false);
    });
  }

  const canConfirm = reason.trim().length > 0 && acknowledged && !loadingImpact && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Badge
          variant={enabled ? "default" : "destructive"}
          className="cursor-pointer select-none"
          role="button"
          tabIndex={0}
        >
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{nextEnabled ? `Re-enable ${moduleName}` : `Disable ${moduleName} platform-wide`}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {nextEnabled
              ? `${moduleName} will immediately become reachable again for every business whose own license already entitles them to it.`
              : `${moduleName} will immediately become unreachable for every business, platform-wide, regardless of their own license status.`}
          </DialogDescription>
        </DialogHeader>

        {!nextEnabled ? (
          <Alert variant="destructive" className="border-red-900/50 bg-red-950/30">
            <AlertTriangle className="size-4" />
            <AlertTitle>Impact</AlertTitle>
            <AlertDescription>
              {loadingImpact
                ? "Checking how many businesses are currently affected…"
                : impact === null
                  ? "Could not load the current impact count."
                  : `${impact} business${impact === 1 ? "" : "es"} currently ${impact === 1 ? "has" : "have"} an active or grace-period license for ${moduleName}. They will lose access immediately.`}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="kill-switch-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="kill-switch-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={nextEnabled ? "e.g. Incident resolved, safe to restore" : "e.g. Investigating a data-integrity bug in this module"}
            className="border-zinc-700 bg-zinc-900 text-zinc-50 placeholder:text-zinc-500"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-zinc-300">
          <Checkbox checked={acknowledged} onCheckedChange={(next) => setAcknowledged(next === true)} className="mt-0.5" />
          <span>
            {nextEnabled
              ? "I understand this restores access immediately and confirm this change."
              : "I understand this immediately blocks every business from using this module and confirm this change."}
          </span>
        </label>

        <DialogFooter>
          <Button variant="ghost" className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={nextEnabled ? "default" : "destructive"} disabled={!canConfirm} onClick={confirm}>
            {isPending ? "Saving…" : nextEnabled ? "Re-enable module" : "Disable module"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
