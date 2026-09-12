"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import type { PlanFeatureEntitlement } from "@cofounderai/core/admin/platform-plan-features";
import {
  createFeatureAction,
  deleteFeatureAction,
  setPlanFeatureEnabledAction,
} from "./actions";

const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * PLATFORM-P0-04.4 ("Feature-Level Entitlements") -- the third and last section of
 * PLATFORM-P0-04.2's own eventual composite page. Grouped by module, one checkbox per
 * feature for this plan (instant toggle, same reasoning as 04.3's module switches: a
 * single boolean needs no separate save step). A small inline "Add a feature" form
 * defines a new catalog entry (global -- every other plan implicitly does not entitle it
 * yet, see `platform-plan-features.ts`'s own docstring), and each feature gets a delete
 * affordance behind an `AlertDialog` confirmation -- deleting a feature definition removes
 * it, and its entitlement, from *every* plan, not just this one, so it gets the same
 * "deliberate, confirmed action" treatment `publish-controls.tsx`'s Publish/Discard
 * buttons already established for a global, hard-to-undo change.
 */
export function FeatureEntitlementsSection({
  planId,
  entitlements,
  modules,
}: {
  planId: string;
  entitlements: PlanFeatureEntitlement[];
  modules: { key: string; name: string }[];
}) {
  const [rows, setRows] = useState(entitlements);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [addOpen, setAddOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addPending, startAddTransition] = useTransition();

  const grouped = useMemo(() => {
    const byModule = new Map<string, PlanFeatureEntitlement[]>();
    for (const row of rows) {
      const list = byModule.get(row.moduleKey) ?? [];
      list.push(row);
      byModule.set(row.moduleKey, list);
    }
    return [...byModule.entries()];
  }, [rows]);

  function toggle(featureId: string, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.featureId === featureId ? { ...row, enabled: next } : row)));
    setPendingId(featureId);
    startTransition(async () => {
      const result = await setPlanFeatureEnabledAction(planId, featureId, next);
      setPendingId(null);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Feature enabled for this plan." : "Feature disabled for this plan.");
    });
  }

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startAddTransition(async () => {
      const result = await createFeatureAction(planId, {
        moduleKey: String(formData.get("moduleKey") ?? ""),
        key: String(formData.get("key") ?? ""),
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        return;
      }
      setFieldErrors({});
      setAddOpen(false);
      toast.success("Feature added -- not entitled on any plan by default.");
    });
  }

  function remove(featureId: string) {
    setPendingId(featureId);
    startTransition(async () => {
      const result = await deleteFeatureAction(planId, featureId);
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((r) => r.filter((row) => row.featureId !== featureId));
      toast.success("Feature removed from every plan.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Feature-level entitlements</h2>
          <p className="text-xs text-zinc-500">Finer-grained capabilities within a module, gated per plan.</p>
        </div>
        <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
              Add a feature
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-50">
            <AlertDialogHeader>
              <AlertDialogTitle>Add a feature</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                Added to the shared catalog. Not entitled on any plan (including this one) until you toggle it below.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form id="add-feature-form" onSubmit={handleAddSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="moduleKey" className="text-zinc-300">
                  Module
                </Label>
                <NativeSelect id="moduleKey" name="moduleKey" className={FIELD_CLASS} defaultValue={modules[0]?.key}>
                  {modules.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key" className="text-zinc-300">
                  Key
                </Label>
                <Input id="key" name="key" placeholder="advanced_signals" className={FIELD_CLASS} aria-invalid={Boolean(fieldErrors.key)} />
                {fieldErrors.key ? <p className="text-xs text-red-400">{fieldErrors.key}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name" className="text-zinc-300">
                  Name
                </Label>
                <Input id="name" name="name" placeholder="Advanced Signals" className={FIELD_CLASS} aria-invalid={Boolean(fieldErrors.name)} />
                {fieldErrors.name ? <p className="text-xs text-red-400">{fieldErrors.name}</p> : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description" className="text-zinc-300">
                  Description (optional)
                </Label>
                <Input id="description" name="description" className={FIELD_CLASS} />
              </div>
            </form>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
                Cancel
              </AlertDialogCancel>
              <Button type="submit" form="add-feature-form" disabled={addPending}>
                {addPending ? "Adding…" : "Add feature"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {grouped.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500">No features defined yet.</p>
      ) : (
        <div className="divide-y divide-zinc-800">
          {grouped.map(([moduleKey, features]) => (
            <div key={moduleKey} className="p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {modules.find((m) => m.key === moduleKey)?.name ?? moduleKey}
              </p>
              <ul className="flex flex-col gap-2">
                {features.map((f) => (
                  <li key={f.featureId} className="flex items-center justify-between gap-3 text-sm text-zinc-100">
                    <label className="flex flex-1 items-center gap-2">
                      <Checkbox
                        checked={f.enabled}
                        disabled={pendingId === f.featureId}
                        onCheckedChange={(next) => toggle(f.featureId, next === true)}
                      />
                      <span>
                        {f.featureName}
                        {f.featureDescription ? <span className="ml-2 text-xs text-zinc-500">{f.featureDescription}</span> : null}
                      </span>
                    </label>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendingId === f.featureId}
                          className="text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                          aria-label={`Delete ${f.featureName}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-50">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete &quot;{f.featureName}&quot;?</AlertDialogTitle>
                          <AlertDialogDescription className="text-zinc-400">
                            Removes this feature from the catalog and every plan that entitles it -- not just this one. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(f.featureId)} className="bg-red-600 text-white hover:bg-red-500">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
