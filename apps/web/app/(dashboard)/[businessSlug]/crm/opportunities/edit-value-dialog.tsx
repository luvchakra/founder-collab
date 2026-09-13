"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import type { Opportunity } from "@cofounderai/module-crm/lib/opportunities/types";

/**
 * CRM-04.3's edit affordance -- a dialog rather than a separate page, per
 * docs/design/claude-ui-design-rules.md rule 4 ("do not force users to navigate to
 * another page merely to perform a simple edit"). One dialog per row, matching the
 * Edit-button pattern purchase-orders-list.tsx already uses for its own per-row edit.
 */
export function EditValueDialog({ opportunity, action }: { opportunity: Opportunity; action: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Opportunity value</DialogTitle>
        </DialogHeader>
        <form
          action={async (formData) => {
            await action(formData);
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`value-${opportunity.id}`}>Estimated value</Label>
              <Input id={`value-${opportunity.id}`} name="estimatedValue" type="number" min={0} step="0.01" defaultValue={opportunity.estimated_value ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`currency-${opportunity.id}`}>Currency</Label>
              <Input id={`currency-${opportunity.id}`} name="currency" defaultValue={opportunity.currency} maxLength={3} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`probability-${opportunity.id}`}>Probability (%)</Label>
            <Input id={`probability-${opportunity.id}`} name="probability" type="number" min={0} max={100} defaultValue={opportunity.probability ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`close-date-${opportunity.id}`}>Expected close date</Label>
            <Input id={`close-date-${opportunity.id}`} name="expectedCloseDate" type="date" defaultValue={opportunity.expected_close_date ?? ""} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingText="Saving...">Save</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
