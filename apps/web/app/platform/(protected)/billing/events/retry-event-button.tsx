"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { retryBillingEventAction } from "../actions";

/** BILL-30 (§96) -- re-process one stored event now; the result shows inline. */
export function RetryEventButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      const result = await retryBillingEventAction(eventId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.outcome ? `Event ${result.outcome}.` : "Event re-processed.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={retry} disabled={pending}>
        <RotateCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
        {pending ? "Retrying…" : "Retry"}
      </Button>
      {error ? (
        <p role="alert" className="max-w-48 text-right text-xs text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
