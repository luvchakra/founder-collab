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
import { MONITORING_FREQUENCY_LABEL, MONITORING_FREQUENCY_VALUES } from "../../lib/discovery-definitions/types";
import type { DiscoveryDefinition } from "../../lib/discovery-definitions/types";

type FormResult = { error: string } | { success: true };

function toLines(items: string[]) {
  return items.join("\n");
}

/**
 * DISC-OFFER-P0-04.1's "user can create/edit a Discovery Definition" -- one dialog, two
 * modes, same shape as OfferingFormDialog/PersonaFormDialog. List fields are plain
 * Textareas (one item per line, same convention as the ICP page's own fields) rather
 * than IcpField's collapse/expand treatment -- that component is built for a whole page
 * of fields sharing one form; a dialog is already compact enough not to need it.
 */
export function DefinitionFormDialog({
  mode,
  definition,
  action,
  initialValues,
  triggerLabel,
}: {
  mode: "create" | "edit";
  definition?: DiscoveryDefinition;
  action: (formData: FormData) => Promise<FormResult>;
  /** DISC-OFFER-P0-04.2's "Discovery Play" presets -- create-mode only, a starting
   * point the founder still reviews and can edit before saving, same as every other
   * pre-filled-but-not-auto-saved proposal in this platform. */
  initialValues?: { name?: string; desiredSignals?: string[] };
  triggerLabel?: string;
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
      toast.success(mode === "create" ? "Discovery definition created." : "Discovery definition updated.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm" variant={initialValues ? "outline" : "default"}>
            <Plus className="size-4" aria-hidden="true" />
            {triggerLabel ?? "New definition"}
          </Button>
        ) : (
          <button
            type="button"
            aria-label={`Edit ${definition?.name}`}
            className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New discovery definition" : `Edit ${definition?.name}`}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={definition?.name ?? initialValues?.name} placeholder="e.g. Recently Funded Watch" required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monitoringFrequency">Monitoring frequency</Label>
              <NativeSelect id="monitoringFrequency" name="monitoringFrequency" defaultValue={definition?.monitoring_frequency ?? "weekly"}>
                {MONITORING_FREQUENCY_VALUES.map((freq) => (
                  <option key={freq} value={freq}>
                    {MONITORING_FREQUENCY_LABEL[freq]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minimumScore">Minimum score (0-100)</Label>
              <Input id="minimumScore" name="minimumScore" type="number" min={0} max={100} defaultValue={definition?.minimum_score ?? ""} placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetGeographies">Target geographies</Label>
              <Textarea id="targetGeographies" name="targetGeographies" rows={3} defaultValue={toLines(definition?.target_geographies ?? [])} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetIndustries">Target industries</Label>
              <Textarea id="targetIndustries" name="targetIndustries" rows={3} defaultValue={toLines(definition?.target_industries ?? [])} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="buyerRoles">Buyer roles</Label>
              <Textarea id="buyerRoles" name="buyerRoles" rows={3} defaultValue={toLines(definition?.buyer_roles ?? [])} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desiredSignals">Desired signals</Label>
              <Textarea id="desiredSignals" name="desiredSignals" rows={3} defaultValue={toLines(definition?.desired_signals ?? initialValues?.desiredSignals ?? [])} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excludedSignals">Excluded signals</Label>
              <Textarea id="excludedSignals" name="excludedSignals" rows={3} defaultValue={toLines(definition?.excluded_signals ?? [])} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="disqualifiers">Disqualifiers</Label>
              <Textarea id="disqualifiers" name="disqualifiers" rows={3} defaultValue={toLines(definition?.disqualifiers ?? [])} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">One item per line.</p>

          <DialogFooter>
            <SubmitButton disabled={pending} pendingText={mode === "create" ? "Creating..." : "Saving..."}>
              {mode === "create" ? "Create definition" : "Save changes"}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
