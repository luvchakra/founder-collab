import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { INVESTOR_SOURCES, INVESTOR_SOURCE_LABEL, INVESTOR_TYPES, INVESTOR_TYPE_LABEL, type Investor } from "../../lib/funding/types";
import { Field } from "../marketing/field";

/** FND-07 — the investor form (§24.1). Multi-value fields are one per line. */
export function InvestorFields({ investor }: { investor?: Investor | null }) {
  const i = investor ?? null;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Investor or fund" htmlFor="inv-name">
          <Input id="inv-name" name="name" required maxLength={300} defaultValue={i?.name ?? ""} />
        </Field>
        <Field label="Type" htmlFor="investorType">
          <NativeSelect id="investorType" name="investorType" defaultValue={i?.investorType ?? "vc"}>
            {INVESTOR_TYPES.map((t) => (
              <option key={t} value={t}>
                {INVESTOR_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="General email" htmlFor="inv-email">
          <Input id="inv-email" name="email" type="email" defaultValue={i?.email ?? ""} />
        </Field>
        <Field label="Website" htmlFor="inv-website">
          <Input id="inv-website" name="website" type="url" placeholder="https://" defaultValue={i?.website ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Stages" htmlFor="stages" hint="One per line.">
          <Textarea id="stages" name="stages" rows={3} defaultValue={i?.stages.join("\n") ?? ""} />
        </Field>
        <Field label="Sectors" htmlFor="sectors" hint="One per line.">
          <Textarea id="sectors" name="sectors" rows={3} defaultValue={i?.sectors.join("\n") ?? ""} />
        </Field>
        <Field label="Geographies" htmlFor="geographies" hint="One per line.">
          <Textarea id="geographies" name="geographies" rows={3} defaultValue={i?.geographies.join("\n") ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Smallest cheque" htmlFor="checkMin">
          <Input id="checkMin" name="checkMin" inputMode="decimal" defaultValue={i?.checkMin ?? ""} />
        </Field>
        <Field label="Largest cheque" htmlFor="checkMax">
          <Input id="checkMax" name="checkMax" inputMode="decimal" defaultValue={i?.checkMax ?? ""} />
        </Field>
        <Field label="Currency" htmlFor="inv-currency">
          <Input id="inv-currency" name="currency" maxLength={3} className="uppercase" defaultValue={i?.currency ?? "INR"} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How you found them" htmlFor="source">
          <NativeSelect id="source" name="source" defaultValue={i?.source ?? "founder_network"}>
            {INVESTOR_SOURCES.map((s) => (
              <option key={s} value={s}>
                {INVESTOR_SOURCE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Referral / source note" htmlFor="sourceNote">
          <Input id="sourceNote" name="sourceNote" defaultValue={i?.sourceNote ?? ""} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="inv-notes">
        <Textarea id="inv-notes" name="notes" rows={2} defaultValue={i?.notes ?? ""} />
      </Field>
    </>
  );
}
