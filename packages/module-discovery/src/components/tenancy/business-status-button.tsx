"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { toast } from "@cofounderai/core/ui/sonner";

type ToggleResult = { error: string } | { success: true };

/**
 * Item #17 of a UX pass: an Admin-menu option to disable a business without deleting
 * it -- confirmed (it hides the business from every module's navbar/switcher until
 * re-enabled) since that's a real, if reversible, change to what the founder and their
 * team can reach day to day. Re-enabling is the low-stakes direction, so it skips the
 * confirmation dialog and just runs immediately.
 */
export function BusinessStatusButton({
  businessName,
  disabled,
  disableAction,
  enableAction,
}: {
  businessName: string;
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(enableAction, `"${businessName}" is back in the navbar.`)}
        className="gap-1.5 text-xs"
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        Re-enable
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={pending} className="gap-1.5 text-xs">
          <EyeOff className="size-3.5" aria-hidden="true" />
          Disable
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable &quot;{businessName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes {businessName} from the navbar and business switcher for
            everyone on the account. Nothing is deleted -- every product, prospect,
            job, ticket, and document it owns stays exactly as it is, and re-enabling
            brings it straight back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep visible</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(disableAction, `"${businessName}" is hidden from the navbar.`)}>
            Disable
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
