"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import type { NotificationPolicies } from "@cofounderai/core/admin/platform-notification-policies";
import { updateNotificationPoliciesAction } from "./actions";

/**
 * PLATFORM-P0-11.3 (Notification Policies, config-only). A plain always-editable form, not
 * a dialog -- this is a standalone settings screen with exactly one purpose (three
 * toggles), the same "simplest implementation that works" choice `branding-form.tsx` made
 * for its own always-open form over a view/edit toggle (CLAUDE.md development principle
 * #1). No "reason" field -- unlike PLATFORM-P0-11.1/11.2's audited-RPC pattern, this
 * table's plain RLS-gated update carries no audit trail (see the migration's own docstring
 * for why that lighter pattern was chosen here).
 */
export function NotificationPoliciesForm({ policies }: { policies: NotificationPolicies }) {
  const [pending, startTransition] = useTransition();
  const [emailEnabled, setEmailEnabled] = useState(policies.emailEnabled);
  const [inAppEnabled, setInAppEnabled] = useState(policies.inAppEnabled);
  const [pushEnabled, setPushEnabled] = useState(policies.pushEnabled);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateNotificationPoliciesAction({ emailEnabled, inAppEnabled, pushEnabled });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Notification policies updated.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 p-4">
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <Checkbox checked={emailEnabled} onCheckedChange={(checked) => setEmailEnabled(checked === true)} />
        Email enabled by default
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <Checkbox checked={inAppEnabled} onCheckedChange={(checked) => setInAppEnabled(checked === true)} />
        In-app enabled by default
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <Checkbox checked={pushEnabled} onCheckedChange={(checked) => setPushEnabled(checked === true)} />
        Push enabled by default
      </label>

      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
        <p className="text-xs text-zinc-500">
          Last updated {new Date(policies.updatedAt).toLocaleString()}
          {policies.updatedBy ? "" : " (never changed)"}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
