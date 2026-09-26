import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { WatchlistEntry } from "../../lib/watchlist/types";

/** DISC-OFFER-P1 §7-01.3 "Account Watchlist" -- placed in the prospect header, next to
 * the status form: watching is a per-account decision a founder makes right where
 * they're already looking at the account, not a separate workflow. Not-watched shows a
 * one-line "why + optional next review date" form; watched shows the same two fields
 * pre-filled plus a Stop watching button, matching this codebase's own
 * add-then-edit-in-place convention (e.g. `RediscoverySchedule`). */
export function WatchlistToggle({
  entry,
  addAction,
  updateAction,
  removeAction,
}: {
  entry: WatchlistEntry | null;
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  removeAction: () => Promise<void>;
}) {
  const nextReviewDefault = entry?.next_review_at ? entry.next_review_at.slice(0, 10) : "";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-medium">{entry ? "On watchlist" : "Not on watchlist"}</p>
        {entry ? (
          <form action={removeAction}>
            <SubmitButton variant="ghost" size="sm" pendingText="Removing...">
              Stop watching
            </SubmitButton>
          </form>
        ) : null}
      </div>
      <form action={entry ? updateAction : addAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="watchReason">Watch reason</Label>
          <Input id="watchReason" name="watchReason" defaultValue={entry?.watch_reason ?? ""} placeholder="e.g. Close to budget approval" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nextReviewAt">Next review</Label>
          <Input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={nextReviewDefault} />
        </div>
        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
          {entry ? "Update watch" : "Watch this account"}
        </SubmitButton>
      </form>
    </div>
  );
}
