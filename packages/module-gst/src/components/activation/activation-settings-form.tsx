import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { AccountingMethod } from "../../lib/activation/types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * FIN-3: the two steps with no existing screen of their own (accounting method, fiscal
 * year) -- edited right here rather than sent to a new page each, since each is a single
 * field. Plain `<form action>`s, not `useActionState`: there's nothing to show inline
 * after saving that a page reload (via `revalidatePath` in the action) doesn't already
 * cover, same as every settings form elsewhere in this module.
 */
export function ActivationSettingsForm({
  accountingMethod,
  fiscalYearStartMonth,
  canManage,
  setAccountingMethodAction,
  setFiscalYearStartMonthAction,
}: {
  accountingMethod: AccountingMethod;
  fiscalYearStartMonth: number;
  canManage: boolean;
  setAccountingMethodAction: (formData: FormData) => Promise<void>;
  setFiscalYearStartMonthAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
      <form action={setAccountingMethodAction} className="flex flex-col gap-1.5">
        <Label htmlFor="accountingMethod">Accounting method</Label>
        <div className="flex gap-2">
          <NativeSelect id="accountingMethod" name="accountingMethod" defaultValue={accountingMethod} disabled={!canManage} className="flex-1">
            <option value="accrual">Accrual</option>
            <option value="cash">Cash</option>
          </NativeSelect>
          {canManage ? (
            <SubmitButton variant="outline" size="sm">
              Save
            </SubmitButton>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">Reporting only -- the ledger itself is unaffected either way.</p>
      </form>

      <form action={setFiscalYearStartMonthAction} className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalYearStartMonth">Fiscal year starts in</Label>
        <div className="flex gap-2">
          <NativeSelect id="fiscalYearStartMonth" name="fiscalYearStartMonth" defaultValue={fiscalYearStartMonth} disabled={!canManage} className="flex-1">
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </NativeSelect>
          {canManage ? (
            <SubmitButton variant="outline" size="sm">
              Save
            </SubmitButton>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">April is India&apos;s default; change it if this business reports on a different year.</p>
      </form>
    </div>
  );
}
