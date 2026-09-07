"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { INDIAN_STATES } from "@cofounderai/core/lib/gst";
import type { Customer } from "../../lib/customers/types";

export type CustomerActionState = { error: string } | { success: true } | null;

/** Create/edit customer form -- ported from stockpilot-ai-ops's Customers dialog into
 * this platform's own hand-rolled overlay pattern (see WarehouseModal/SupplierModal). */
export function CustomerModal({
  action,
  customer,
  onClose,
}: {
  action: (prevState: CustomerActionState, formData: FormData) => Promise<CustomerActionState>;
  /** Present when editing an existing customer; absent when creating one. */
  customer?: Customer;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<CustomerActionState, FormData>(action, null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    if (state && "success" in state) onClose();
  }, [state, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-100 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
        className={`relative w-full max-w-lg rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        <h2 id="customer-modal-title" className="text-lg font-semibold">
          {customer ? "Edit customer" : "New customer"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-name">Name</Label>
              <Input
                ref={inputRef}
                id="cust-name"
                name="name"
                required
                defaultValue={customer?.name}
                placeholder="Retail Buyer Pvt Ltd"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-phone">Phone</Label>
              <Input id="cust-phone" name="phone" defaultValue={customer?.phone ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-email">Email</Label>
              <Input id="cust-email" name="email" type="email" defaultValue={customer?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-gst">GSTIN</Label>
              <Input
                id="cust-gst"
                name="gstin"
                defaultValue={customer?.gstin ?? ""}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-state">State (for GST place of supply)</Label>
              <NativeSelect id="cust-state" name="state" defaultValue={customer?.state ?? ""}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-billing">Billing address</Label>
              <Input id="cust-billing" name="billing_address" defaultValue={customer?.billing_address ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-shipping">Shipping address</Label>
              <Input
                id="cust-shipping"
                name="shipping_address"
                defaultValue={customer?.shipping_address ?? ""}
                placeholder="Same as billing if left blank"
              />
            </div>
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText={customer ? "Saving..." : "Creating..."}>
              {customer ? "Save changes" : "Create customer"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
