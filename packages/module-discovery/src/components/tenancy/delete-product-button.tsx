"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { toast } from "@cofounderai/core/ui/sonner";

/**
 * Item #12 of a UX pass ("give option to delete the product as well," alongside the AI
 * auto-populate feature that creates them) -- a real delete, not an archive, so the
 * confirmation names exactly what's at stake when the product has real work behind it
 * rather than a generic "are you sure." Sits on each product card as a small trailing
 * icon button (`stopPropagation` on its own click, matching how prospects-cards.tsx's
 * checkbox coexists with its card's own stretched Link) rather than only being reachable
 * from the product's own detail page, since this is most useful right after the
 * auto-populate preview -- removing a wrongly-created entry shouldn't require opening it
 * first.
 */
export function DeleteProductButton({
  productName,
  prospectCount,
  action,
}: {
  productName: string;
  prospectCount: number;
  action: () => Promise<{ error: string } | { success: true }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(`Deleted "${productName}".`);
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Delete ${productName}`}
          disabled={pending}
          className="relative z-10 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{productName}&quot;?</AlertDialogTitle>
          <AlertDialogDescription>
            {prospectCount > 0
              ? `This permanently deletes ${productName} and everything in its workspace, including ${prospectCount} prospect${prospectCount === 1 ? "" : "s"} and all their research. This cannot be undone.`
              : `This permanently deletes ${productName}. It has no prospects yet, so nothing else is lost. This cannot be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep product</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
