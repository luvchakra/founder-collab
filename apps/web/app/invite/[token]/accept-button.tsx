"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await acceptInvitationAction(token);
            if (!result.ok) setError(result.error);
            else {
              router.push(result.href);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
