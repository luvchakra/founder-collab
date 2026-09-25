import { Input } from "@cofounderai/core/ui/input";
import { Field } from "./field";

const COUNT_FIELDS = [
  ["impressions", "Impressions"],
  ["clicks", "Clicks"],
  ["sessions", "Website sessions"],
  ["engagements", "Engagements"],
  ["leads", "Leads"],
  ["qualifiedLeads", "Qualified leads"],
  ["opportunities", "Opportunities"],
  ["customers", "Customers"],
] as const;

/**
 * MKT-06 — one day's reported numbers for a campaign. Blank means "not reported" and is
 * stored as null; type 0 only when the channel really reported zero (§10).
 */
export function MetricFields({ currency }: { currency: string | null }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor="metricDate">
          <Input id="metricDate" name="metricDate" type="date" required defaultValue={today} max={today} />
        </Field>
        <input type="hidden" name="source" value="manual" />
      </div>
      <p className="text-xs text-muted-foreground">Leave a box blank if the channel didn&apos;t report it — blank is not zero.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COUNT_FIELDS.map(([name, label]) => (
          <Field key={name} label={label} htmlFor={`m-${name}`}>
            <Input id={`m-${name}`} name={name} inputMode="numeric" />
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Spend" htmlFor="m-spend">
          <Input id="m-spend" name="spend" inputMode="decimal" />
        </Field>
        <Field label="Revenue" htmlFor="m-revenue">
          <Input id="m-revenue" name="revenue" inputMode="decimal" />
        </Field>
        <Field label="Currency" htmlFor="m-currency">
          <Input id="m-currency" name="currency" maxLength={3} defaultValue={currency ?? "INR"} className="uppercase" />
        </Field>
      </div>
    </>
  );
}
