"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { changePlanAction } from "../actions";

export function ConfirmChangeButton({ businessSlug, planId, interval, label }: { businessSlug: string; planId: string; interval: "month" | "year"; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await changePlanAction(businessSlug, planId, interval);
            if (!result.ok) setError(result.error);
            else router.push(`/${businessSlug}/billing`);
          })
        }
      >
        {pending ? "Updating…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
