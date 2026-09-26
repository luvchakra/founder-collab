"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { cancelSubscriptionAction } from "../actions";

const REASONS = ["Too expensive", "Missing features I need", "Switching to another product", "Only needed it temporarily", "Other"];

export function CancelForm({ businessSlug }: { businessSlug: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cancel-reason">Tell us why (optional)</Label>
        <select
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Select a reason…</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await cancelSubscriptionAction(businessSlug, reason || null);
            if (!result.ok) setError(result.error);
            else router.push(`/${businessSlug}/billing`);
          })
        }
      >
        {pending ? "Cancelling…" : "Cancel subscription"}
      </Button>
      <Button asChild variant="outline">
        <Link href={`/${businessSlug}/billing`}>Keep my plan</Link>
      </Button>
    </div>
  );
}
