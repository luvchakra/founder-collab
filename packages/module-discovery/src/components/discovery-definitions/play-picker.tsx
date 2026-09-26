import { DefinitionFormDialog } from "./definition-form-dialog";
import { DISCOVERY_PLAYS } from "../../lib/discovery-definitions/plays";

type ActionResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-04.2 "Discovery Play" -- "each play must inherit the active offering
 * context": `createAction` is already bound to the current business/offering by the
 * caller (same `createAction` the plain "New definition" button uses), so a play
 * created here writes into this offering's own workspace, never a different one.
 */
export function PlayPicker({ createAction }: { createAction: (formData: FormData) => Promise<ActionResult> }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Start from a play</p>
        <p className="text-xs text-muted-foreground">Founder-friendly presets -- pick one to pre-fill a new definition, then review and edit before saving.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {DISCOVERY_PLAYS.map((play) => (
          <DefinitionFormDialog
            key={play.key}
            mode="create"
            action={createAction}
            triggerLabel={play.label}
            initialValues={{ name: play.label, desiredSignals: play.desiredSignals }}
          />
        ))}
      </div>
    </div>
  );
}
