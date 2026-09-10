"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { toast } from "@cofounderai/core/ui/sonner";

type ToggleResult = { error: string } | { success: true };

/**
 * Item #4 of a UX pass: "along with delete, give an option to disable" a product --
 * same disable/enable shape as business-status-button.tsx's own business-level toggle,
 * but products skip the confirmation dialog in both directions (unlike a business,
 * disabling one product isn't hiding the whole navbar for everyone on the account --
 * it's reversible with one click either way, so a confirm step would only add friction).
 */
export function ProductStatusButton({
  productName,
  disabled,
  disableAction,
  enableAction,
}: {
  productName: string;
  disabled: boolean;
  disableAction: () => Promise<ToggleResult>;
  enableAction: () => Promise<ToggleResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ToggleResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(successMessage);
    });
  }

  if (disabled) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          run(enableAction, `"${productName}" is active again.`);
        }}
        disabled={pending}
        aria-label={`Enable ${productName}`}
        title="Enable"
        className="relative z-10 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        run(disableAction, `"${productName}" is disabled.`);
      }}
      disabled={pending}
      aria-label={`Disable ${productName}`}
      title="Disable"
      className="relative z-10 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <EyeOff className="size-3.5" aria-hidden="true" />
    </button>
  );
}
