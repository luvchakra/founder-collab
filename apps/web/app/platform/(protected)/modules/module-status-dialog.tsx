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
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { ModuleStatus } from "@cofounderai/core/admin/platform-modules";
import { getModuleImpactAction, setModuleStatusAction } from "./actions";

const STATUS_LABELS: Record<ModuleStatus, string> = {
  available: "Available",
  read_only: "Read-only",
  maintenance: "Maintenance",
  disabled: "Disabled",
};

/** PLATFORM-P0-07.3 decision #1/#3: `maintenance` and `disabled` are the exact same full
 * block -- both require the same ceremony (reason, live impact count, explicit
 * acknowledgement) this dialog shows, in EITHER direction (entering OR leaving one of
 * these two statuses), mirroring PLATFORM-P0-07.2's own dialog already requiring the same
 * ceremony for re-enabling, not only disabling. */
function isFullBlock(status: ModuleStatus): boolean {
  return status === "maintenance" || status === "disabled";
}

const STATUS_BADGE_VARIANT: Record<ModuleStatus, "default" | "destructive" | "secondary"> = {
  available: "default",
  read_only: "secondary",
  maintenance: "secondary",
  disabled: "destructive",
};

/**
 * PLATFORM-P0-07.3 ("Module Maintenance Mode") -- replaces PLATFORM-P0-07.2's own
 * `KillSwitchDialog` as the one place `status`/`customer_facing_message` are ever changed
 * from the UI, now that the user's own reconciliation decisions mean `status` (not a
 * separate `enabled` toggle) is the single control for every one of the four states,
 * including the old kill switch's plain on/off. §11's own four kill-switch requirements
 * apply identically to reaching `disabled` OR `maintenance` (decisions #1/#3):
 *   - **reason**: the required `Textarea` below -- the confirm button stays disabled
 *     until it's non-empty (mirrors the server-side check in
 *     `platform.set_module_status()`, which also rejects an empty reason for every
 *     transition, not only a blocking one).
 *   - **impact confirmation**: the real, live count of businesses currently licensing
 *     this module (`getModuleImpactAction()`, fetched fresh each time the dialog opens),
 *     shown whenever the transition enters or leaves a fully-blocked status.
 *   - **explicit confirmation**: a separate acknowledgement `Checkbox`, required only for
 *     the same fully-blocking transitions -- moving between `available` and `read_only`
 *     (neither a full block) still requires a reason but skips this ceremony, since
 *     neither status blocks any business outright.
 *   - **audit record**: not this component's concern directly -- `setModuleStatusAction()`
 *     calls the one RPC (`platform.set_module_status()`) that writes
 *     `platform.module_status_events` atomically with the change itself, including the
 *     optional customer-facing message's own before/after values (decision #4).
 */
export function ModuleStatusDialog({
  moduleKey,
  moduleName,
  status,
  message,
  onChanged,
}: {
  moduleKey: string;
  moduleName: string;
  status: ModuleStatus;
  message: string | null;
  /** Called with the new status/message after a successful change, so the parent table's
   * own row state (a separate `useState` copy) reflects it immediately without waiting on
   * a full page revalidation. */
  onChanged: (status: ModuleStatus, message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<ModuleStatus>(status);
  const [draftMessage, setDraftMessage] = useState(message ?? "");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [impact, setImpact] = useState<number | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [isPending, startTransition] = useTransition();

  const needsCeremony = isFullBlock(status) || isFullBlock(draftStatus);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraftStatus(status);
      setDraftMessage(message ?? "");
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
      const result = await setModuleStatusAction({ moduleKey, status: draftStatus, message: draftMessage, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${moduleName} is now ${STATUS_LABELS[draftStatus].toLowerCase()}.`);
      onChanged(draftStatus, draftMessage.trim() === "" ? null : draftMessage.trim());
      setOpen(false);
    });
  }

  const canConfirm =
    reason.trim().length > 0 && (!needsCeremony || acknowledged) && !loadingImpact && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Badge variant={STATUS_BADGE_VARIANT[status]} className="cursor-pointer select-none" role="button" tabIndex={0}>
          {STATUS_LABELS[status]}
        </Badge>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change {moduleName}&apos;s platform-wide status</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Currently <strong>{STATUS_LABELS[status]}</strong>. This applies to every business, platform-wide,
            regardless of their own license status.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="module-status-select" className="text-zinc-300">
            New status
          </Label>
          <NativeSelect
            id="module-status-select"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as ModuleStatus)}
            className="border-zinc-700 bg-zinc-900 text-zinc-50"
          >
            {(Object.keys(STATUS_LABELS) as ModuleStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-zinc-500">
            {draftStatus === "available" && "Fully reachable for every business whose own license entitles them to it."}
            {draftStatus === "read_only" &&
              "Reachable and readable for every entitled business, but no business can save changes -- the same read-only shape as a license's own 30-day grace period."}
            {draftStatus === "maintenance" &&
              "Unreachable for every business, platform-wide -- the exact same full block as Disabled, differing only in the message shown below (temporary, not indefinite)."}
            {draftStatus === "disabled" && "Unreachable for every business, platform-wide, regardless of their own license status."}
          </p>
        </div>

        {needsCeremony ? (
          <Alert variant="destructive" className="border-red-900/50 bg-red-950/30">
            <AlertTriangle className="size-4" />
            <AlertTitle>Impact</AlertTitle>
            <AlertDescription>
              {loadingImpact
                ? "Checking how many businesses are currently affected…"
                : impact === null
                  ? "Could not load the current impact count."
                  : `${impact} business${impact === 1 ? "" : "es"} currently ${impact === 1 ? "has" : "have"} an active or grace-period license for ${moduleName}.`}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="module-status-message" className="text-zinc-300">
            Customer-facing message (optional)
          </Label>
          <Textarea
            id="module-status-message"
            value={draftMessage}
            onChange={(e) => setDraftMessage(e.target.value)}
            placeholder="e.g. Back at 5pm IST after a scheduled database migration."
            className="border-zinc-700 bg-zinc-900 text-zinc-50 placeholder:text-zinc-500"
          />
          <p className="text-xs text-zinc-500">
            Shown to a blocked or degraded business instead of the default WonderArc message. Leave blank to use the
            default copy for the selected status.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="module-status-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="module-status-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Investigating a data-integrity bug in this module"
            className="border-zinc-700 bg-zinc-900 text-zinc-50 placeholder:text-zinc-500"
          />
        </div>

        {needsCeremony ? (
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <Checkbox checked={acknowledged} onCheckedChange={(next) => setAcknowledged(next === true)} className="mt-0.5" />
            <span>
              I understand this change immediately affects every business&apos;s access to {moduleName} and confirm
              this change.
            </span>
          </label>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={isFullBlock(draftStatus) ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={confirm}
          >
            {isPending ? "Saving…" : "Save status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
