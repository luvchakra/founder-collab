import type { ReactNode } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { MARKETING_CHANNELS, MARKETING_CHANNEL_LABEL, type MarketingStrategy } from "../../lib/marketing/types";
import { Field } from "./field";

const list = (v?: string[]) => (v ?? []).join("\n");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * MKT-04 — the marketing strategy form (§8.1). Multi-value fields are one item per line.
 * Saving always writes a new draft version; the active strategy is untouched until that
 * draft is activated.
 */
export function StrategyFields({
  strategy,
  offerings,
}: {
  strategy: MarketingStrategy | null;
  offerings: { id: string; name: string }[];
}) {
  const s = strategy;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Strategy name" htmlFor="name">
          <Input id="name" name="name" required maxLength={200} defaultValue={s?.name ?? "Marketing strategy"} />
        </Field>
        <Field label="Scope" htmlFor="offeringId">
          <NativeSelect id="offeringId" name="offeringId" defaultValue={s?.offeringId ?? ""}>
            <option value="">Whole company</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Section title="Positioning">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <Input id="category" name="category" defaultValue={s?.positioning.category ?? ""} />
          </Field>
          <Field label="Problem we solve" htmlFor="targetProblem">
            <Input id="targetProblem" name="targetProblem" defaultValue={s?.positioning.targetProblem ?? ""} />
          </Field>
        </div>
        <Field label="Positioning statement" htmlFor="positioningStatement">
          <Textarea id="positioningStatement" name="positioningStatement" rows={2} defaultValue={s?.positioning.statement ?? ""} />
        </Field>
        <Field label="Market context" htmlFor="marketContext">
          <Textarea id="marketContext" name="marketContext" rows={2} defaultValue={s?.positioning.marketContext ?? ""} />
        </Field>
      </Section>

      <Section title="Value proposition">
        <Field label="Headline" htmlFor="headline">
          <Input id="headline" name="headline" defaultValue={s?.valueProposition.headline ?? ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supporting points" htmlFor="supportingPoints" hint="One per line.">
            <Textarea id="supportingPoints" name="supportingPoints" rows={4} defaultValue={list(s?.valueProposition.supportingPoints)} />
          </Field>
          <Field label="Proof points" htmlFor="proofPoints" hint="Evidence a buyer can check. One per line.">
            <Textarea id="proofPoints" name="proofPoints" rows={4} defaultValue={list(s?.valueProposition.proofPoints)} />
          </Field>
        </div>
      </Section>

      <Section title="Differentiation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Differentiators" htmlFor="differentiators" hint="One per line.">
            <Textarea id="differentiators" name="differentiators" rows={4} defaultValue={list(s?.differentiation.differentiators)} />
          </Field>
          <Field label="Versus competitors" htmlFor="competitorStatements" hint="One per line.">
            <Textarea id="competitorStatements" name="competitorStatements" rows={4} defaultValue={list(s?.differentiation.competitorStatements)} />
          </Field>
        </div>
        <Field label="Why us" htmlFor="whyUs">
          <Textarea id="whyUs" name="whyUs" rows={2} defaultValue={s?.differentiation.whyUs ?? ""} />
        </Field>
      </Section>

      <Section title="Target markets">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Regions" htmlFor="regions" hint="One per line.">
            <Textarea id="regions" name="regions" rows={3} defaultValue={list(s?.targetMarkets.regions)} />
          </Field>
          <Field label="Industries" htmlFor="industries" hint="One per line.">
            <Textarea id="industries" name="industries" rows={3} defaultValue={list(s?.targetMarkets.industries)} />
          </Field>
          <Field label="Company segments" htmlFor="companySegments" hint="One per line.">
            <Textarea id="companySegments" name="companySegments" rows={3} defaultValue={list(s?.targetMarkets.companySegments)} />
          </Field>
          <Field label="Buyer segments" htmlFor="buyerSegments" hint="One per line.">
            <Textarea id="buyerSegments" name="buyerSegments" rows={3} defaultValue={list(s?.targetMarkets.buyerSegments)} />
          </Field>
        </div>
      </Section>

      <Section title="Messaging and channels">
        <Field label="Key messages" htmlFor="keyMessages" hint="One per line.">
          <Textarea id="keyMessages" name="keyMessages" rows={4} defaultValue={list(s?.messaging.keyMessages)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium">Channels</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MARKETING_CHANNELS.map((ch) => (
              <label key={ch} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="channels" value={ch} defaultChecked={s?.channels.includes(ch) ?? false} className="size-4" />
                {MARKETING_CHANNEL_LABEL[ch]}
              </label>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
