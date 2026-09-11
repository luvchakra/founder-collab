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
import { toast } from "@cofounderai/core/ui/sonner";
import { PersonaFormDialog } from "./persona-form-dialog";
import { PERSONA_PRIORITY_LABEL, PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import type { BuyerPersona } from "../../lib/personas/types";

type ActionResult = { error: string } | { success: true };

const PRIORITY_BADGE_VARIANT = { high: "default", medium: "secondary", low: "outline" } as const;

/**
 * DISC-OFFER-P0-02.3 -- "Offering Buyer Persona Definition". A plain list of compact
 * cards rather than a `<Table>`: each persona already carries only a handful of short
 * fields, so a row-per-card layout reads cleanly at every width without needing a
 * separate desktop-table/mobile-card split (CLAUDE.md non-negotiable #12's concern
 * doesn't arise here since there's no wide table to begin with).
 */
export function PersonaSection({
  personas,
  createAction,
  updateAction,
  deleteAction,
}: {
  personas: BuyerPersona[];
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (personaId: string, formData: FormData) => Promise<ActionResult>;
  deleteAction: (personaId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function runDelete(personaId: string, title: string) {
    startTransition(async () => {
      const result = await deleteAction(personaId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(`Removed "${title}".`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Buyer personas</h2>
          <p className="text-xs text-muted-foreground">Who, within a buying committee, this offering is sold to.</p>
        </div>
        <PersonaFormDialog mode="create" action={createAction} />
      </div>

      {personas.length === 0 ? (
        <EmptyState
          variant="inline"
          message="No buyer personas yet. Add the roles involved in a purchase decision, e.g. an executive buyer, a decision maker, and an influencer."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {personas.map((persona) => (
            <li key={persona.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{persona.title}</span>
                  <Badge variant="secondary">{PERSONA_ROLE_LABEL[persona.role_in_committee]}</Badge>
                  <Badge variant={PRIORITY_BADGE_VARIANT[persona.priority]}>{PERSONA_PRIORITY_LABEL[persona.priority]} priority</Badge>
                </div>
                {persona.notes ? <p className="text-xs text-muted-foreground">{persona.notes}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <PersonaFormDialog mode="edit" persona={persona} action={updateAction.bind(null, persona.id)} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Delete ${persona.title}`}
                      disabled={pending}
                      className="rounded-sm p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete &quot;{persona.title}&quot;?</AlertDialogTitle>
                      <AlertDialogDescription>This removes this buyer persona. This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep persona</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => runDelete(persona.id, persona.title)}
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
