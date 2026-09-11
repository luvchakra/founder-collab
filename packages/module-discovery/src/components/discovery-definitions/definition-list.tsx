"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
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
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Switch } from "@cofounderai/core/ui/switch";
import { toast } from "@cofounderai/core/ui/sonner";
import { DefinitionFormDialog } from "./definition-form-dialog";
import { MONITORING_FREQUENCY_LABEL } from "../../lib/discovery-definitions/types";
import type { DiscoveryDefinition } from "../../lib/discovery-definitions/types";

type ActionResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-04.1's "multiple definitions per offering" + "enable/disable" -- a plain
 * list of compact cards, same reasoning as PersonaSection: each definition's summary
 * (name, frequency, a couple of badges) is short enough that there's no wide-table/
 * mobile-card split to design.
 */
export function DefinitionList({
  definitions,
  createAction,
  updateAction,
  setEnabledAction,
  deleteAction,
}: {
  definitions: DiscoveryDefinition[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (definitionId: string, formData: FormData) => Promise<ActionResult>;
  setEnabledAction: (definitionId: string, isEnabled: boolean) => Promise<ActionResult>;
  deleteAction: (definitionId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runToggle(definitionId: string, isEnabled: boolean) {
    startTransition(async () => {
      const result = await setEnabledAction(definitionId, isEnabled);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function runDelete(definitionId: string, name: string) {
    startTransition(async () => {
      const result = await deleteAction(definitionId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(`Deleted "${name}".`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Discovery definitions</h2>
          <p className="text-xs text-muted-foreground">What to watch for, and how, for this offering.</p>
        </div>
        <DefinitionFormDialog mode="create" action={createAction} />
      </div>

      {definitions.length === 0 ? (
        <EmptyState
          variant="inline"
          message="No discovery definitions yet. Add one to define target geographies, industries, buyer roles, and the signals worth watching for."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {definitions.map((definition) => (
            <li key={definition.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{definition.name}</span>
                  <Badge variant="secondary">{MONITORING_FREQUENCY_LABEL[definition.monitoring_frequency]}</Badge>
                  {!definition.is_enabled ? <Badge variant="outline">Disabled</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {definition.desired_signals.length > 0 ? definition.desired_signals.join(", ") : "No signals defined yet"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={definition.is_enabled}
                  disabled={pending}
                  onCheckedChange={(checked) => runToggle(definition.id, checked)}
                  aria-label={definition.is_enabled ? `Disable ${definition.name}` : `Enable ${definition.name}`}
                />
                <DefinitionFormDialog mode="edit" definition={definition} action={updateAction.bind(null, definition.id)} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Delete ${definition.name}`}
                      disabled={pending}
                      className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete &quot;{definition.name}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>This removes this discovery definition. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep definition</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => runDelete(definition.id, definition.name)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
