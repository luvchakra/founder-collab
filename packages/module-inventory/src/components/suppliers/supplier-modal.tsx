"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { INDIAN_STATES } from "@cofounderai/core/lib/gst";
import type { Supplier } from "../../lib/suppliers/types";

export type SupplierActionState = { error: string } | { success: true } | null;

/** Create/edit supplier form -- ported from stockpilot-ai-ops's Suppliers dialog into
 * this platform's own hand-rolled overlay pattern (see WarehouseModal). */
export function SupplierModal({
  action,
  supplier,
  onClose,
}: {
  action: (prevState: SupplierActionState, formData: FormData) => Promise<SupplierActionState>;
  /** Present when editing an existing supplier; absent when creating one. */
  supplier?: Supplier;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<SupplierActionState, FormData>(action, null);
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
        aria-labelledby="supplier-modal-title"
        className={`relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
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

        <h2 id="supplier-modal-title" className="text-lg font-semibold">
          {supplier ? "Edit supplier" : "New supplier"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-name">Name</Label>
              <Input ref={inputRef} id="sup-name" name="name" required defaultValue={supplier?.name} placeholder="Acme Traders" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-code">Code</Label>
              <Input id="sup-code" name="code" defaultValue={supplier?.code ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-contact">Contact person</Label>
              <Input id="sup-contact" name="contact_person" defaultValue={supplier?.contact_person ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-phone">Phone</Label>
              <Input id="sup-phone" name="phone" defaultValue={supplier?.phone ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-email">Email</Label>
              <Input id="sup-email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-gst">GSTIN</Label>
              <Input
                id="sup-gst"
                name="gst_number"
                defaultValue={supplier?.gst_number ?? ""}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="uppercase"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-address">Address</Label>
              <Input id="sup-address" name="address" defaultValue={supplier?.address ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-city">City</Label>
              <Input id="sup-city" name="city" defaultValue={supplier?.city ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-state">State (for GST place of supply)</Label>
              <NativeSelect id="sup-state" name="state" defaultValue={supplier?.state ?? ""}>
                <option value="">Select state</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-terms">Payment terms</Label>
              <Input id="sup-terms" name="payment_terms" defaultValue={supplier?.payment_terms ?? ""} placeholder="Net 30" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-lead">Lead time (days)</Label>
              <Input id="sup-lead" name="lead_time_days" type="number" min={0} defaultValue={supplier?.lead_time_days ?? 7} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-moq">Minimum order quantity</Label>
              <Input
                id="sup-moq"
                name="min_order_quantity"
                type="number"
                min={0}
                step="0.01"
                defaultValue={supplier?.min_order_quantity ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sup-rating">Rating (0-5)</Label>
              <Input id="sup-rating" name="rating" type="number" min={0} max={5} step="0.5" defaultValue={supplier?.rating ?? 0} />
            </div>
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText={supplier ? "Saving..." : "Creating..."}>
              {supplier ? "Save changes" : "Create supplier"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
