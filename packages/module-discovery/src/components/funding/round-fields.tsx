import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { ROUND_TYPES, ROUND_TYPE_LABEL, type FundingRound } from "../../lib/funding/types";
import { Field } from "../marketing/field";

/** FND-06 — the round form (§23.1). Instrument and valuation are recorded as the founder
 * states them; the product gives no legal or valuation advice (§23.2). */
export function RoundFields({ round }: { round?: FundingRound | null }) {
  const r = round ?? null;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Round name" htmlFor="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={r?.name ?? ""} placeholder="Seed 2026" />
        </Field>
        <Field label="Type" htmlFor="roundType">
          <NativeSelect id="roundType" name="roundType" defaultValue={r?.roundType ?? "seed"}>
            {ROUND_TYPES.map((t) => (
              <option key={t} value={t}>
                {ROUND_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Target" htmlFor="targetAmount">
          <Input id="targetAmount" name="targetAmount" inputMode="decimal" defaultValue={r?.targetAmount ?? ""} />
        </Field>
        <Field label="Minimum" htmlFor="minimumAmount">
          <Input id="minimumAmount" name="minimumAmount" inputMode="decimal" defaultValue={r?.minimumAmount ?? ""} />
        </Field>
        <Field label="Maximum" htmlFor="maximumAmount">
          <Input id="maximumAmount" name="maximumAmount" inputMode="decimal" defaultValue={r?.maximumAmount ?? ""} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Input id="currency" name="currency" maxLength={3} className="uppercase" defaultValue={r?.currency ?? "INR"} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Instrument" htmlFor="instrument" hint="As you describe it.">
          <Input id="instrument" name="instrument" defaultValue={r?.instrument ?? ""} placeholder="Equity, SAFE, CCPS..." />
        </Field>
        <Field label="Pre-money valuation" htmlFor="preMoneyValuation">
          <Input id="preMoneyValuation" name="preMoneyValuation" inputMode="decimal" defaultValue={r?.preMoneyValuation ?? ""} />
        </Field>
        <Field label="Post-money valuation" htmlFor="postMoneyValuation">
          <Input id="postMoneyValuation" name="postMoneyValuation" inputMode="decimal" defaultValue={r?.postMoneyValuation ?? ""} />
        </Field>
        <Field label="Target close" htmlFor="targetCloseDate">
          <Input id="targetCloseDate" name="targetCloseDate" type="date" defaultValue={r?.targetCloseDate ?? ""} />
        </Field>
      </div>
      <Field label="Use of funds" htmlFor="useOfFunds">
        <Textarea id="useOfFunds" name="useOfFunds" rows={3} defaultValue={r?.useOfFunds ?? ""} />
      </Field>
      <Field label="Notes" htmlFor="round-notes">
        <Textarea id="round-notes" name="notes" rows={2} defaultValue={r?.notes ?? ""} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPrimary" defaultChecked={r?.isPrimary ?? true} className="size-4" />
        Primary round (only one live primary round at a time)
      </label>
    </>
  );
}
