"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
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
import { formatDateTime } from "@cofounderai/core/lib/format";
import { publishBrandingAction, discardBrandingAction } from "./actions";

// Same hardcoded-dark-chrome override every other component on this page needs (see
// branding-form.tsx's own note) -- the vendored AlertDialog's defaults resolve against the
// site's light-theme tokens, which `/platform` never opts into.
const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
// The `outline` Button variant hardcodes `bg-background`/`border-input`, which resolve to
// this same light theme (a near-white button) -- unlike the `default`/`destructive`
// variants below, whose `--primary`/`--destructive` tokens happen to stay legible in both
// themes and so are used unmodified, matching branding-form.tsx's SubmitButton.
const OUTLINE_BUTTON_CLASS = "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50";

/**
 * PLATFORM-P0-03.5 ("Preview Before Publish"): the Publish/Discard controls shared by both
 * the Edit page (`page.tsx`) and the Preview page (`preview/page.tsx`) -- "Global branding
 * changes should not become active merely because a field was edited" means Publish has to
 * be its own deliberate, confirmed step, not folded into the same "Save" button 03.1/03.3
 * used to use. Mirrors the `AlertDialog`-confirm pattern
 * `promote-to-crm-button.tsx` already establishes elsewhere in this codebase, rather than
 * inventing a new confirm-dialog shape for this one page.
 */
export function PublishControls({
  hasDraft,
  draftUpdatedAt,
  showPreviewLink,
}: {
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  /** false on the Preview page itself -- no point linking to Preview from Preview. */
  showPreviewLink: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!hasDraft) {
    return (
      <p className="text-xs text-zinc-500">No unpublished changes. Edit a field and save to start a new draft.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-900/50 bg-amber-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-amber-200">
        <p className="font-semibold text-amber-100">Unpublished draft</p>
        <p>
          {draftUpdatedAt ? `Saved ${formatDateTime(draftUpdatedAt)}. ` : null}
          Live pages (e.g. the login screen) still show the last published version.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {showPreviewLink ? (
          <Button variant="outline" size="sm" className={OUTLINE_BUTTON_CLASS} asChild>
            <Link href="/platform/branding/preview">Preview draft</Link>
          </Button>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className={OUTLINE_BUTTON_CLASS} disabled={pending}>
              Discard draft
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className={DIALOG_CLASS}>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                Every unpublished field change is dropped. The live, published branding is
                unaffected either way.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await discardBrandingAction();
                      toast.success("Draft discarded.");
                      router.refresh();
                    })
                  }
                >
                  Discard
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={pending}>
              Publish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className={DIALOG_CLASS}>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish WonderArc branding?</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                This makes the draft live everywhere it&apos;s read -- immediately, for
                every WonderArc customer (e.g. the public login page). This cannot be
                undone from here; you would need to edit and publish again to change it
                back.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await publishBrandingAction();
                      if (result.ok) {
                        toast.success("Branding published.");
                      } else {
                        toast.error(result.error);
                      }
                      router.refresh();
                    })
                  }
                >
                  Publish
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
