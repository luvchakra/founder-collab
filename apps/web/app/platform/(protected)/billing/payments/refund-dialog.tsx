"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { refundPaymentAction } from "../actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * BILL-28 (§78) -- amount (blank = everything still unrefunded), reason, explicit confirm,
 * then the provider's refund API. The payment row is not changed here: it turns refunded
 * when the provider's refund webhook (or the next sync) confirms it.
 */
export function RefundDialog({
  paymentId,
  businessName,
  amountLabel,
  remainingLabel,
  remaining,
  currency,
}: {
  paymentId: string;
  businessName: string;
  amountLabel: string;
  remainingLabel: string;
  remaining: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setAmount("");
    setReason("");
    setConfirmed(false);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await refundPaymentAction({ paymentId, amount, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Refund requested. The payment updates when the provider confirms it.");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          <Undo2 className="size-4" aria-hidden="true" />
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {businessName} · {amountLabel} paid · {remainingLabel} refundable
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`refund-amount-${paymentId}`} className="text-zinc-300">
            Amount ({currency}, optional)
          </Label>
          <Input
            id={`refund-amount-${paymentId}`}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Blank = full ${remaining.toFixed(2)}`}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`refund-reason-${paymentId}`} className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id={`refund-reason-${paymentId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Duplicate payment"
            className={FIELD_CLASS}
            rows={2}
          />
        </div>
        <p className="text-xs text-zinc-500">
          The refund is issued by the provider. This payment is marked refunded only when the provider confirms it, and a
          refund doesn&apos;t by itself change the subscription or its licences.
        </p>
        <label className="flex items-start gap-2 text-sm text-zinc-200">
          <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
          I confirm this refund of {amount.trim() === "" ? remainingLabel : `${amount.trim()} ${currency}`}.
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !confirmed || reason.trim().length === 0}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {pending ? "Requesting…" : "Request refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
