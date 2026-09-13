"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Switch } from "@cofounderai/core/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import type { CompliancePackFeature } from "@cofounderai/core/admin/platform-compliance";
import { createCompliancePackFeatureAction, setCompliancePackFeatureEnabledAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * PLATFORM-P0-13.4 ("Compliance Feature Flags") -- one instant-flip switch per named
 * capability within this compliance pack (the doc's own example: "India: GST=enabled,
 * E-Invoice=enabled, E-Way Bill=enabled, IMS=enabled"), plus a small inline "Add a
 * feature" form for a superadmin to define more over time (mirrors
 * `feature-entitlements-section.tsx`'s own add-a-feature shape -- no delete affordance
 * here, since this migration grants no DELETE to `authenticated` at all, matching
 * `platform.plans`' own "disable, never remove" stance).
 */
export function FeatureFlagsSection({ packId, features }: { packId: string; features: CompliancePackFeature[] }) {
  const [rows, setRows] = useState(features);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [addOpen, setAddOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addPending, startAddTransition] = useTransition();

  function toggle(featureId: string, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.id === featureId ? { ...row, enabled: next } : row)));
    setPendingId(featureId);
    startTransition(async () => {
      const result = await setCompliancePackFeatureEnabledAction(packId, featureId, next);
      setPendingId(null);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Feature enabled." : "Feature disabled.");
    });
  }

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startAddTransition(async () => {
      const result = await createCompliancePackFeatureAction(packId, {
        featureKey: String(formData.get("featureKey") ?? ""),
        displayName: String(formData.get("displayName") ?? ""),
        enabled: true,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        return;
      }
      setFieldErrors({});
      setRows((r) => [...r, result.feature]);
      setAddOpen(false);
      toast.success("Feature added.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Feature flags</h2>
          <p className="text-xs text-zinc-500">Named capabilities within this compliance pack.</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
              Add a feature
            </Button>
          </DialogTrigger>
          <DialogContent className={`${DIALOG_CLASS} max-w-sm`}>
            <DialogHeader>
              <DialogTitle>Add a feature</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="featureKey" className="text-zinc-300">
                  Key
                </Label>
                <Input
                  id="featureKey"
                  name="featureKey"
                  placeholder="eway_bill"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.featureKey)}
                />
                {fieldErrors.featureKey ? <p className="text-xs text-red-400">{fieldErrors.featureKey}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="displayName" className="text-zinc-300">
                  Display name
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  placeholder="E-Way Bill"
                  className={FIELD_CLASS}
                  aria-invalid={Boolean(fieldErrors.displayName)}
                />
                {fieldErrors.displayName ? <p className="text-xs text-red-400">{fieldErrors.displayName}</p> : null}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addPending}>
                  {addPending ? "Adding…" : "Add feature"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">No feature flags defined for this pack yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {rows.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 p-3 text-sm text-zinc-100">
              <div>
                <p className="font-medium">{f.displayName}</p>
                <p className="text-xs text-zinc-500">{f.featureKey}</p>
              </div>
              <Switch
                checked={f.enabled}
                disabled={pendingId === f.id}
                onCheckedChange={(next) => toggle(f.id, next)}
                aria-label={`Toggle ${f.displayName}`}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
