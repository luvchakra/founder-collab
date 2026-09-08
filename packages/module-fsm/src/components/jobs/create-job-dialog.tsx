"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@cofounderai/core/ui/dialog";
import type { CustomerOption } from "../../lib/opportunities/types";
import type { ServiceTypeOption } from "../../lib/service-types/types";

export type CreateJobActionState = { error: string } | { success: true; id: string } | null;

/** Jobs can be created directly, not only via an approved estimate (PRD §1.3) -- same
 * form shape as CreateOpportunityDialog, pointed at jobs instead. */
export function CreateJobDialog({
  action,
  customers,
  serviceTypes,
}: {
  action: (prevState: CreateJobActionState, formData: FormData) => Promise<CreateJobActionState>;
  customers: CustomerOption[];
  serviceTypes: ServiceTypeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState(customers.length === 0);
  const [state, formAction] = useActionState<CreateJobActionState, FormData>(action, null);

  useEffect(() => {
    if (state && "success" in state) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          New job
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Customer</Label>
              {customers.length > 0 ? (
                <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setNewCustomer((v) => !v)}>
                  {newCustomer ? "Pick an existing customer instead" : "New customer instead"}
                </button>
              ) : null}
            </div>
            {newCustomer ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="new_customer_name" placeholder="Customer name" required className="sm:col-span-2" />
                <Input name="new_customer_phone" placeholder="Phone" />
                <Input name="new_customer_email" placeholder="Email" type="email" />
              </div>
            ) : (
              <NativeSelect name="party_id" required>
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>

          {serviceTypes.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-service-type">Service</Label>
              <NativeSelect id="job-service-type" name="service_type_id">
                <option value="">No service type</option>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="job-description">Internal description</Label>
            <Textarea id="job-description" name="description" placeholder="Notes for your own team" rows={2} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="job-scope">Scope of work (customer-facing)</Label>
            <Textarea id="job-scope" name="scope_of_work" placeholder="What you'll tell the customer" rows={2} />
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingText="Creating...">Create job</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
