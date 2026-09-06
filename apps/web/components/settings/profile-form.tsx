"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

export function ProfileForm({
  defaultFullName,
  defaultBio,
  defaultPhone,
  email,
  action,
}: {
  defaultFullName: string;
  defaultBio: string;
  defaultPhone: string;
  email: string;
  action: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
}) {
  const [state, formAction] = useActionState<RenameActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">Name</Label>
        <Input id="fullName" name="fullName" defaultValue={defaultFullName} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" defaultValue={defaultPhone} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" rows={3} defaultValue={defaultBio} />
      </div>

      {state && "error" in state ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state && "success" in state ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <SubmitButton className="self-start" pendingText="Saving...">
        Save
      </SubmitButton>
    </form>
  );
}
