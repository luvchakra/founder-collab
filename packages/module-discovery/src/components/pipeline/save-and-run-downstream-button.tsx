"use client";

import { Check, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";

/**
 * DISC-OFFER-P0-11.1/11.2, upgraded by DISC-OFFER-P1-02.2 "Rerun Impact Confirmation" --
 * the doc's own exact worked example ("Changing ICP will update: ✓ Buyer Personas ✓
 * Discovery Strategy ... [Save & Run Downstream] [Save Only] [Cancel]"). 11.1 originally
 * guarded this with a plain `window.confirm()` -- a single yes/no sentence, not the
 * doc's own named checklist, and only ever a binary "proceed with the one button already
 * clicked, or abort it" rather than the doc's own three co-equal choices offered
 * together. This replaces that native confirm with a real dialog naming every affected
 * founder-facing group (DISC-OFFER-P0-11.3's own `downstreamGroupLabels`) and all three
 * of the doc's own actions in one place.
 *
 * `formId` is the enclosing `<form>`'s own id. Radix renders `AlertDialogContent` into a
 * portal (typically `document.body`), so the two real submit buttons inside it are no
 * longer DOM descendants of that form -- they're associated back to it with the standard
 * HTML `form` attribute instead (exactly what that attribute exists for: a submit
 * control anywhere in the document, portal included, can still submit a specific form),
 * with `formAction` on each still overriding which server action this particular click
 * submits to, precisely as it did when both buttons lived directly inside the form.
 * "Save Only" reuses the very same default action the form's own always-visible "Save"
 * button next to this one already submits -- clicking it here is simply a second way to
 * reach that same outcome for a founder who opened this dialog and then decided not to
 * rerun anything downstream, not a new code path of its own.
 */
export function SaveAndRunDownstreamButton({
  formId,
  runDownstreamAction,
  saveOnlyAction,
  affectedLabels,
}: {
  formId: string;
  runDownstreamAction: (formData: FormData) => void | Promise<void>;
  saveOnlyAction: (formData: FormData) => void | Promise<void>;
  affectedLabels: string[];
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <RefreshCw className="size-3.5" />
          Save &amp; Run Downstream
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This will update</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {affectedLabels.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-1 text-foreground">
                {affectedLabels.map((label) => (
                  <li key={label} className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-primary" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <span>Nothing downstream depends on this yet -- this saves your change only.</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <SubmitButton type="submit" form={formId} formAction={saveOnlyAction} variant="outline" pendingText="Saving...">
            Save Only
          </SubmitButton>
          <SubmitButton type="submit" form={formId} formAction={runDownstreamAction} pendingText="Saving...">
            Save &amp; Run Downstream
          </SubmitButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
