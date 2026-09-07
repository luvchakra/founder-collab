"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { Warehouse } from "../../lib/warehouses/types";

export type WarehouseActionState = { error: string } | { success: true } | null;

/**
 * Create/edit warehouse form -- ported from stockpilot-ai-ops's Warehouses dialog
 * (Dialog/DialogContent from shadcn) into this platform's own hand-rolled overlay
 * pattern (see CreateBusinessModal), since that's this codebase's established modal
 * convention, not the vendored shadcn Dialog primitive.
 */
export function WarehouseModal({
  action,
  warehouse,
  onClose,
}: {
  action: (prevState: WarehouseActionState, formData: FormData) => Promise<WarehouseActionState>;
  /** Present when editing an existing warehouse; absent when creating one. */
  warehouse?: Warehouse;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<WarehouseActionState, FormData>(action, null);
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
        aria-labelledby="warehouse-modal-title"
        className={`relative w-full max-w-md rounded-2xl border bg-popover p-6 shadow-2xl transition-[transform,opacity] duration-100 ${
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

        <h2 id="warehouse-modal-title" className="text-lg font-semibold">
          {warehouse ? "Edit warehouse" : "New warehouse"}
        </h2>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-name">Name</Label>
              <Input
                ref={inputRef}
                id="wh-name"
                name="name"
                required
                defaultValue={warehouse?.name}
                placeholder="Mumbai Warehouse"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-code">Code</Label>
              <Input id="wh-code" name="code" required defaultValue={warehouse?.code} placeholder="WH-MUM" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-city">City</Label>
              <Input id="wh-city" name="city" defaultValue={warehouse?.city ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-state">State</Label>
              <Input id="wh-state" name="state" defaultValue={warehouse?.state ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-postal">PIN code</Label>
              <Input id="wh-postal" name="postal_code" defaultValue={warehouse?.postal_code ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-contact-name">Contact name</Label>
              <Input id="wh-contact-name" name="contact_name" defaultValue={warehouse?.contact_name ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wh-contact-phone">Contact phone</Label>
              <Input id="wh-contact-phone" name="contact_phone" defaultValue={warehouse?.contact_phone ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wh-address">Address</Label>
            <Input id="wh-address" name="address" defaultValue={warehouse?.address ?? ""} />
          </div>

          {state && "error" in state ? <p className="text-sm text-destructive">{state.error}</p> : null}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pendingText={warehouse ? "Saving..." : "Creating..."}>
              {warehouse ? "Save changes" : "Create warehouse"}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
