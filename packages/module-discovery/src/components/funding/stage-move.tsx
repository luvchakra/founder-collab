import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { allowedStageMoves } from "../../lib/funding/lifecycle";
import { PIPELINE_STAGE_LABEL, type PipelineRecord } from "../../lib/funding/types";
import { ActionForm, type FormAction } from "../marketing/action-form";

/**
 * FND-09 — move one investor to another stage. Offers only the legal moves; the amount
 * fields matter only for Committed (the commitment) and Invested (money received), and
 * the server refuses those stages without them.
 */
export function StageMoveForm({ record, action }: { record: PipelineRecord; action: FormAction }) {
  const moves = allowedStageMoves(record.stage);
  if (moves.length === 0) return null;
  const id = `move-${record.id}`;
  return (
    <ActionForm action={action} submitLabel="Move" size="sm" variant="secondary" className="gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${id}-to`}>
          Move to
          <NativeSelect id={`${id}-to`} name="to" defaultValue={moves[0]}>
            {moves.map((s) => (
              <option key={s} value={s}>
                {PIPELINE_STAGE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${id}-committed`}>
          Committed amount
          <Input id={`${id}-committed`} name="committedAmount" inputMode="decimal" defaultValue={record.committedAmount ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${id}-invested`}>
          Received amount
          <Input id={`${id}-invested`} name="investedAmount" inputMode="decimal" defaultValue={record.investedAmount ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${id}-currency`}>
          Currency
          <Input id={`${id}-currency`} name="currency" maxLength={3} className="uppercase" defaultValue={record.currency ?? ""} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground" htmlFor={`${id}-pass`}>
        Reason, if they passed
        <Input id={`${id}-pass`} name="passReason" maxLength={500} />
      </label>
    </ActionForm>
  );
}
