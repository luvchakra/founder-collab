"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cofounderai/core/ui/button";
import { acceptLegalVersionsAction } from "./actions";

export function AcceptLegalButton({ versionIds }: { versionIds: string[] }) {
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
            const result = await acceptLegalVersionsAction(versionIds);
            if (!result.ok) setError(result.error);
            else {
              router.push("/dashboard");
              router.refresh();
            }
          })
        }
      >
        {pending ? "Saving…" : "I agree"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
