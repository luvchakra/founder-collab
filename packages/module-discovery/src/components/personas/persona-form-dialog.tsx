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
import { PERSONA_PRIORITY_LABEL, PERSONA_PRIORITY_VALUES, PERSONA_ROLE_LABEL, PERSONA_ROLE_VALUES } from "../../lib/personas/types";
import type { BuyerPersona } from "../../lib/personas/types";

type FormResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-02.3's "user can edit persona definitions" -- one dialog, two modes, same
 * pattern as OfferingFormDialog: a founder editing a persona later gets the exact same
 * layout they created it in.
 */
export function PersonaFormDialog({
  mode,
  persona,
  action,
}: {
  mode: "create" | "edit";
  persona?: BuyerPersona;
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
      toast.success(mode === "create" ? "Persona added." : "Persona updated.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button variant="outline" size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Add persona
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`Edit ${persona?.title}`}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add buyer persona" : `Edit ${persona?.title}`}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={persona?.title} placeholder="e.g. CISO" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="roleInCommittee">Buying-committee role</Label>
              <NativeSelect id="roleInCommittee" name="roleInCommittee" defaultValue={persona?.role_in_committee ?? "decision_maker"}>
                {PERSONA_ROLE_VALUES.map((role) => (
                  <option key={role} value={role}>
                    {PERSONA_ROLE_LABEL[role]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Priority</Label>
              <NativeSelect id="priority" name="priority" defaultValue={persona?.priority ?? "medium"}>
                {PERSONA_PRIORITY_VALUES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PERSONA_PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={3} defaultValue={persona?.notes ?? ""} placeholder="What this persona cares about, typical objections, etc." />
          </div>
          <DialogFooter>
            <SubmitButton disabled={pending} pendingText={mode === "create" ? "Adding..." : "Saving..."}>
              {mode === "create" ? "Add persona" : "Save changes"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
