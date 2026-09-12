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
import type { IntegrationStatus } from "@cofounderai/core/admin/platform-integrations";
import { setIntegrationStatusAction } from "./actions";

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  needs_reauthorization: "Needs Reauthorization",
  disabled: "Disabled",
};

const STATUS_BADGE_VARIANT: Record<IntegrationStatus, "default" | "destructive" | "secondary"> = {
  connected: "default",
  disconnected: "secondary",
  error: "destructive",
  needs_reauthorization: "secondary",
  disabled: "destructive",
};

/** PLATFORM-P0-12.3's own "allow emergency disabling" -- unlike PLATFORM-P0-07.2's module
 * kill switch, §16 does not list a live "impact confirmation" count among 12.3's own
 * requirements (only "allow emergency disabling", against 12.1/12.2/12.4's own narrower
 * scope) -- so this dialog deliberately does not compute one. Building a live per-category
 * business-impact count would mean this `packages/core` admin surface directly querying
 * `crm.channel_accounts`/the gst credential tables (this run's own file-scope boundary
 * forbids touching those modules' own files, and this section's text never asked for the
 * count in the first place -- CLAUDE.md development principle #7). The explicit
 * acknowledgement checkbox below, required only for the one truly dangerous transition
 * (into or out of `disabled`), is this dialog's own "emergency" ceremony instead. */
function isKillSwitch(status: IntegrationStatus): boolean {
  return status === "disabled";
}

/**
 * PLATFORM-P0-12.2/12.3 -- the one place an integration category's platform-wide `status`
 * (and the `notes` field alongside it) is ever changed from the UI, including the
 * emergency kill-switch transition into/out of `disabled`. Mirrors
 * `ModuleStatusDialog` (PLATFORM-P0-07.3) closely -- same reason-required-always shape,
 * same "extra ceremony only for the genuinely dangerous transition" split -- narrowed to
 * this section's own, smaller requirement set (see `isKillSwitch()`'s own docstring for
 * why no impact count is shown here).
 */
export function IntegrationStatusDialog({
  integrationKey,
  displayName,
  status,
  notes,
  onChanged,
}: {
  integrationKey: string;
  displayName: string;
  status: IntegrationStatus;
  notes: string | null;
  /** Called with the new status/notes after a successful change, so the parent table's own
   * row state (a separate `useState` copy) reflects it immediately without waiting on a
   * full page revalidation. */
  onChanged: (status: IntegrationStatus, notes: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<IntegrationStatus>(status);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();

  const needsCeremony = isKillSwitch(status) || isKillSwitch(draftStatus);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraftStatus(status);
      setDraftNotes(notes ?? "");
      setReason("");
      setAcknowledged(false);
    }
  }

  function confirm() {
    startTransition(async () => {
      const result = await setIntegrationStatusAction({
        integrationKey,
        status: draftStatus,
        notes: draftNotes,
        reason,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${displayName} is now ${STATUS_LABELS[draftStatus].toLowerCase()}.`);
      onChanged(draftStatus, draftNotes.trim() === "" ? null : draftNotes.trim());
      setOpen(false);
    });
  }

  const canConfirm = reason.trim().length > 0 && (!needsCeremony || acknowledged) && !isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Badge variant={STATUS_BADGE_VARIANT[status]} className="cursor-pointer select-none" role="button" tabIndex={0}>
          {STATUS_LABELS[status]}
        </Badge>
      </DialogTrigger>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change {displayName}&apos;s platform-wide status</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Currently <strong>{STATUS_LABELS[status]}</strong>. This applies platform-wide, to every business,
            regardless of whether they have their own credentials connected for {displayName}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="integration-status-select" className="text-zinc-300">
            New status
          </Label>
          <NativeSelect
            id="integration-status-select"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as IntegrationStatus)}
            className="border-zinc-700 bg-zinc-900 text-zinc-50"
          >
            {(Object.keys(STATUS_LABELS) as IntegrationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <p className="text-xs text-zinc-500">
            {draftStatus === "connected" && "Offered normally to every entitled business."}
            {draftStatus === "disconnected" && "Not currently offered platform-wide."}
            {draftStatus === "error" && "A known, category-wide problem is affecting this integration right now."}
            {draftStatus === "needs_reauthorization" &&
              "A platform-level credential or app registration for this category needs attention."}
            {draftStatus === "disabled" &&
              "Emergency kill switch -- unreachable for every business, platform-wide, regardless of their own credentials."}
          </p>
        </div>

        {needsCeremony ? (
          <Alert variant="destructive" className="border-red-900/50 bg-red-950/30">
            <AlertTriangle className="size-4" />
            <AlertTitle>This is the emergency kill switch</AlertTitle>
            <AlertDescription>
              {isKillSwitch(draftStatus)
                ? `Disabling ${displayName} immediately blocks it for every business platform-wide.`
                : `Re-enabling ${displayName} immediately restores it for every business platform-wide.`}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="integration-status-notes" className="text-zinc-300">
            Notes (optional)
          </Label>
          <Textarea
            id="integration-status-notes"
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="e.g. Meta API degraded, investigating"
            className="border-zinc-700 bg-zinc-900 text-zinc-50 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="integration-status-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="integration-status-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Widespread WhatsApp delivery failures reported by several businesses"
            className="border-zinc-700 bg-zinc-900 text-zinc-50 placeholder:text-zinc-500"
          />
        </div>

        {needsCeremony ? (
          <label className="flex items-start gap-2 text-sm text-zinc-300">
            <Checkbox checked={acknowledged} onCheckedChange={(next) => setAcknowledged(next === true)} className="mt-0.5" />
            <span>
              I understand this change immediately affects every business&apos;s access to {displayName} and confirm
              this change.
            </span>
          </label>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={isKillSwitch(draftStatus) ? "destructive" : "default"} disabled={!canConfirm} onClick={confirm}>
            {isPending ? "Saving…" : "Save status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
