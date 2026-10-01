"use client";

import { useActionState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { DSR_TYPE_LABELS, type DsrType } from "@cofounderai/core/privacy/notice";
import type { PrivacyFormState } from "@/app/(dashboard)/dashboard/settings/privacy/actions";

type BoundAction = (prev: PrivacyFormState, formData: FormData) => Promise<PrivacyFormState>;

function Result({ state }: { state: PrivacyFormState }) {
  if (!state) return null;
  return "error" in state ? (
    <p role="alert" className="text-sm text-destructive">
      {state.error}
    </p>
  ) : (
    <p role="status" className="text-sm text-muted-foreground">
      {state.success}
    </p>
  );
}

function TypeSelect({ types, id }: { types: DsrType[]; id: string }) {
  return (
    <select
      id={id}
      name="type"
      required
      defaultValue=""
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="" disabled>
        Choose…
      </option>
      {types.map((t) => (
        <option key={t} value={t}>
          {DSR_TYPE_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

export function OwnRequestForm({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="own-type">Request</Label>
      <TypeSelect id="own-type" types={["correction", "restriction", "objection", "grievance", "nomination"]} />
      <Label htmlFor="own-details">Details</Label>
      <Textarea
        id="own-details"
        name="details"
        rows={3}
        required
        placeholder="What should we do? For a nomination, give your nominee's name and email."
      />
      <Result state={state} />
      <Button type="submit" size="sm" variant="outline" className="self-start" disabled={pending}>
        {pending ? "Sending…" : "Submit request"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm({ action, email }: { action: BoundAction; email: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Label htmlFor="confirmEmail">
        Type <span className="font-mono">{email}</span> to confirm
      </Label>
      <Input id="confirmEmail" name="confirmEmail" autoComplete="off" required />
      <Result state={state} />
      <Button type="submit" size="sm" variant="destructive" className="self-start" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account permanently"}
      </Button>
    </form>
  );
}

export function BusinessRequestForm({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="biz-email">Person&apos;s email</Label>
        <Input id="biz-email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="biz-type">Request</Label>
        <TypeSelect
          id="biz-type"
          types={["erasure", "access", "correction", "objection", "restriction", "withdraw_consent", "grievance"]}
        />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="biz-details">Details (optional)</Label>
        <Textarea id="biz-details" name="details" rows={2} />
      </div>
      <div className="sm:col-span-2">
        <Result state={state} />
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending}>
        {pending ? "Logging…" : "Log request"}
      </Button>
    </form>
  );
}
