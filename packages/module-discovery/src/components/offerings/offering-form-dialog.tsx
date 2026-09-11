"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { toast } from "@cofounderai/core/ui/sonner";
import { OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { Offering, OfferingType } from "../../lib/offerings/types";

type FormResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-01.3's "Create/Edit UI" -- one dialog, two modes, rather than a
 * separate create form and edit form: both collect the same field set (name, website,
 * short description, and the Offering-specific fields DISC-OFFER-P0-01.1 added), and a
 * founder editing an offering later benefits from the exact same layout they created it
 * in. `detailedDescription`/`valueProposition`/`primaryProblem` are grouped under their
 * own "Commercial details" heading, separate from the always-visible basics -- keeping
 * the dialog from reading as one undifferentiated wall of inputs (the Global UI Design
 * Rule's own "improve information hierarchy... grouping").
 */
export function OfferingFormDialog({
  mode,
  offering,
  action,
}: {
  mode: "create" | "edit";
  offering?: Offering;
  action: (formData: FormData) => Promise<FormResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
      toast.success(mode === "create" ? "Offering created." : "Offering updated.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New offering
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`Edit ${offering?.name}`}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New offering" : `Edit ${offering?.name}`}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={offering?.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="offeringType">Type</Label>
                <NativeSelect id="offeringType" name="offeringType" defaultValue={offering?.offering_type ?? ""}>
                  <option value="" disabled>
                    Select a type
                  </option>
                  {(Object.keys(OFFERING_TYPE_LABEL) as OfferingType[]).map((type) => (
                    <option key={type} value={type}>
                      {OFFERING_TYPE_LABEL[type]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Category</Label>
                <Input id="category" name="category" defaultValue={offering?.category ?? ""} placeholder="e.g. Managed security services" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" defaultValue={offering?.website ?? ""} placeholder="https://" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Short description</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={offering?.description ?? ""} />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Commercial details</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetMarket">Target market</Label>
              <Input id="targetMarket" name="targetMarket" defaultValue={offering?.target_market ?? ""} placeholder="e.g. Mid-size financial services companies" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="primaryProblem">Primary problem it solves</Label>
              <Textarea id="primaryProblem" name="primaryProblem" rows={2} defaultValue={offering?.primary_problem ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valueProposition">Value proposition</Label>
              <Textarea id="valueProposition" name="valueProposition" rows={2} defaultValue={offering?.value_proposition ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detailedDescription">Detailed description</Label>
              <Textarea id="detailedDescription" name="detailedDescription" rows={4} defaultValue={offering?.detailed_description ?? ""} />
            </div>
          </div>

          <DialogFooter>
            <SubmitButton disabled={pending} pendingText={mode === "create" ? "Creating..." : "Saving..."}>
              {mode === "create" ? "Create offering" : "Save changes"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
