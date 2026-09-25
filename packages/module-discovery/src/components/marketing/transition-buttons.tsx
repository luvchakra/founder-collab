import { ActionForm, type FormAction } from "./action-form";

/**
 * A row of one-click status changes, one form per legal next status. The legal set comes
 * from the lifecycle module, so the buttons shown are exactly the moves the server will
 * accept (§9.4, §12.3). Each button carries its target in a hidden field.
 */
export function TransitionButtons<S extends string>({
  action,
  targets,
  labels,
  confirmFor = {},
  destructive = [],
  fieldName = "to",
}: {
  action: FormAction;
  targets: readonly S[];
  labels: Partial<Record<S, string>>;
  confirmFor?: Partial<Record<S, string>>;
  destructive?: readonly S[];
  /** The hidden field carrying the target; defaults to `to`. */
  fieldName?: string;
}) {
  if (targets.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {targets.map((to) => (
        <ActionForm
          key={to}
          action={action}
          inline
          submitLabel={labels[to] ?? to}
          variant={destructive.includes(to) ? "outline" : "secondary"}
          confirm={confirmFor[to]}
        >
          <input type="hidden" name={fieldName} value={to} />
        </ActionForm>
      ))}
    </div>
  );
}
