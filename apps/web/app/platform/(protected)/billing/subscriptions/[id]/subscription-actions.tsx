"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, GitCompare, RefreshCw, ShieldCheck } from "lucide-react";
import type { SyncDifference } from "@cofounderai/core/admin/platform-billing-ops";
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
import { RadioGroup, RadioGroupItem } from "@cofounderai/core/ui/radio-group";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  applySubscriptionSyncAction,
  cancelSubscriptionAction,
  previewSubscriptionSyncAction,
  reconcileSubscriptionLicensesAction,
} from "../../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";
const GHOST_CLASS = "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50";

type Comparison = { state: "idle" } | { state: "error"; error: string } | { state: "done"; differences: SyncDifference[] };

/**
 * BILL-31 (§45/§46) -- compare first, show every difference, and only then let the admin
 * apply the provider's state (mapped deterministically server-side) with a reason. Plus
 * licence reconciliation on its own, and the explicit administrative cancellation (§8).
 */
export function SubscriptionActions({
  subscriptionId,
  provider,
  hasProviderRecord,
  cancellable,
  cancelAtPeriodEnd,
}: {
  subscriptionId: string;
  provider: string;
  hasProviderRecord: boolean;
  cancellable: boolean;
  cancelAtPeriodEnd: boolean;
}) {
  const providerName = provider === "razorpay" ? "Razorpay" : provider === "stripe" ? "Stripe" : "Provider";
  const [comparison, setComparison] = useState<Comparison>({ state: "idle" });
  const [comparing, startCompare] = useTransition();
  const [reconciling, startReconcile] = useTransition();
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  function compare() {
    startCompare(async () => {
      const result = await previewSubscriptionSyncAction(subscriptionId);
      setComparison(result.ok ? { state: "done", differences: result.differences } : { state: "error", error: result.error });
    });
  }

  function reconcile() {
    setReconcileError(null);
    startReconcile(async () => {
      const result = await reconcileSubscriptionLicensesAction(subscriptionId);
      if (!result.ok) {
        setReconcileError(result.error);
        return;
      }
      toast.success("Licence reconciliation finished.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasProviderRecord ? (
          <>
            <Button size="sm" variant="outline" className={GHOST_CLASS} onClick={compare} disabled={comparing}>
              <GitCompare className="size-4" aria-hidden="true" />
              {comparing ? "Comparing…" : "Compare with provider"}
            </Button>
            <ApplySyncDialog
              subscriptionId={subscriptionId}
              providerName={providerName}
              differences={comparison.state === "done" ? comparison.differences : null}
              onApplied={() => setComparison({ state: "idle" })}
            />
          </>
        ) : null}
        <Button size="sm" variant="outline" className={GHOST_CLASS} onClick={reconcile} disabled={reconciling}>
          <ShieldCheck className="size-4" aria-hidden="true" />
          {reconciling ? "Reconciling…" : "Re-run licence reconciliation"}
        </Button>
        {cancellable ? <CancelDialog subscriptionId={subscriptionId} cancelAtPeriodEnd={cancelAtPeriodEnd} /> : null}
      </div>

      {reconcileError ? (
        <p role="alert" className="text-sm text-red-400">
          {reconcileError}
        </p>
      ) : null}

      {comparison.state === "error" ? (
        <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {comparison.error}
        </p>
      ) : null}
      {comparison.state === "done" ? <ComparisonResult differences={comparison.differences} providerName={providerName} /> : null}
    </div>
  );
}

function ComparisonResult({ differences, providerName }: { differences: SyncDifference[]; providerName: string }) {
  if (differences.length === 0) {
    return (
      <p className="rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-3 text-sm text-emerald-300">
        In sync — WonderArk&apos;s record matches {providerName}.
      </p>
    );
  }
  return <DifferencesTable differences={differences} providerName={providerName} />;
}

function DifferencesTable({ differences, providerName }: { differences: SyncDifference[]; providerName: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3">
      <p className="text-sm font-semibold text-amber-200">State mismatch</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-400">
              <th className="py-1 pr-4 font-medium">Field</th>
              <th className="py-1 pr-4 font-medium">WonderArk</th>
              <th className="py-1 font-medium">{providerName}</th>
            </tr>
          </thead>
          <tbody>
            {differences.map((d) => (
              <tr key={d.field} className="border-t border-amber-900/40">
                <td className="py-1.5 pr-4 text-zinc-300">{d.field}</td>
                <td className="py-1.5 pr-4 font-mono text-xs text-zinc-100">{d.wonderark}</td>
                <td className="py-1.5 font-mono text-xs text-amber-200">{d.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">Nothing has changed yet. Review, then apply the provider&apos;s state if it is correct.</p>
    </div>
  );
}

function ApplySyncDialog({
  subscriptionId,
  providerName,
  differences,
  onApplied,
}: {
  subscriptionId: string;
  providerName: string;
  differences: SyncDifference[] | null;
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setReason("");
    setError(null);
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applySubscriptionSyncAction(subscriptionId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Applied ${providerName}'s state and reconciled licences.`);
      onApplied();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={GHOST_CLASS}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Apply provider state
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Apply {providerName}&apos;s state</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Fetches the subscription from {providerName}, maps it through the same rules webhooks use, then reconciles
            this business&apos;s licences. Recorded with your reason.
          </DialogDescription>
        </DialogHeader>
        {differences === null ? (
          <p className="text-xs text-amber-300">Tip: use &quot;Compare with provider&quot; first to see what will change.</p>
        ) : differences.length === 0 ? (
          <p className="text-xs text-emerald-300">The last comparison found no differences.</p>
        ) : (
          <DifferencesTable differences={differences} providerName={providerName} />
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sync-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="sync-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Missed webhook; provider shows past due"
            className={FIELD_CLASS}
            rows={2}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply} disabled={pending || reason.trim().length === 0}>
            {pending ? "Applying…" : "Apply provider state"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ subscriptionId, cancelAtPeriodEnd }: { subscriptionId: string; cancelAtPeriodEnd: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"period_end" | "immediate">(cancelAtPeriodEnd ? "immediate" : "period_end");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setMode(cancelAtPeriodEnd ? "immediate" : "period_end");
    setConfirmed(false);
    setReason("");
    setError(null);
  }

  const immediate = mode === "immediate";
  const canSubmit = reason.trim().length > 0 && (!immediate || confirmed) && !pending;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscriptionAction(subscriptionId, { immediate, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(immediate ? "Subscription cancelled." : "Subscription will cancel at the end of the period.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-red-900/70 bg-transparent text-red-300 hover:bg-red-950/40 hover:text-red-200">
          <Ban className="size-4" aria-hidden="true" />
          Cancel subscription
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-lg`}>
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription className="text-zinc-400">
            The cancellation is sent to the provider first; WonderArk&apos;s record and licences follow what the provider
            returns. Cancelling never deletes the business&apos;s data.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "period_end" | "immediate")} className="flex flex-col gap-3">
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <RadioGroupItem value="period_end" disabled={cancelAtPeriodEnd} className="mt-0.5 border-zinc-600" />
            <span>
              At the end of the current period
              <span className="block text-xs text-zinc-500">
                {cancelAtPeriodEnd ? "Already scheduled." : "Access continues until the period ends. No refund is issued."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-zinc-200">
            <RadioGroupItem value="immediate" className="mt-0.5 border-zinc-600" />
            <span>
              Immediately
              <span className="block text-xs text-zinc-500">Ends the subscription now; licences it provided enter the 30-day read-only grace period.</span>
            </span>
          </label>
        </RadioGroup>
        {immediate ? (
          <label className="flex items-start gap-2 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
            I understand this ends the subscription immediately and can&apos;t be undone from here.
          </label>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer request via support ticket #1234"
            className={FIELD_CLASS}
            rows={2}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Keep subscription
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} className="bg-red-600 text-white hover:bg-red-500">
            {pending ? "Cancelling…" : immediate ? "Cancel immediately" : "Cancel at period end"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
