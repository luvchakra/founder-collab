"use client";

import { useActionState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { ControlActionState } from "@/app/(dashboard)/dashboard/settings/audit/actions";

type BoundAction = (prev: ControlActionState, formData: FormData) => Promise<ControlActionState>;

function Status({ state }: { state: ControlActionState }) {
  if (!state) return null;
  if ("error" in state) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">Saved.</p>;
}

export function CloseBooksForm({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="closedThrough">Close the books through</Label>
      <div className="flex gap-2">
        <Input id="closedThrough" name="closedThrough" type="date" required className="w-48" />
        <Button type="submit" disabled={pending}>
          {pending ? "Closing…" : "Close period"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function ReopenBooksForm({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="reopenTo">Reopen back to (leave empty to reopen everything)</Label>
      <Input id="reopenTo" name="reopenTo" type="date" className="w-48" />
      <Label htmlFor="reason">Reason (recorded in the audit log)</Label>
      <Textarea id="reason" name="reason" required minLength={10} rows={2} />
      <Button type="submit" variant="outline" className="self-start" disabled={pending}>
        {pending ? "Reopening…" : "Reopen period"}
      </Button>
      <Status state={state} />
    </form>
  );
}
