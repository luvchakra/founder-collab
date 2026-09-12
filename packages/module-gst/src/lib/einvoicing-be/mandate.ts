import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { BeEinvoicingBusinessProfile, BeEinvoicingMandatePhase, BeEinvoicingMandateSchedule } from "./types";

export const BE_EINVOICING_MANDATE_SCHEDULE_RULE: TaxRuleLineage = {
  country: "BE",
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "einvoicing_b2b_mandate_schedule",
};

export function parseBeEinvoicingMandateSchedule(value: Record<string, unknown>): BeEinvoicingMandateSchedule | null {
  const format = typeof value.format === "string" ? value.format : "";
  const phasesRaw = value.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) return null;

  const phases: BeEinvoicingMandatePhase[] = [];
  for (const p of phasesRaw) {
    if (!p || typeof p !== "object") return null;
    const rec = p as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.effectiveFrom !== "string" || typeof rec.scope !== "string" || typeof rec.description !== "string") {
      return null;
    }
    phases.push({ key: rec.key as BeEinvoicingMandatePhase["key"], effectiveFrom: rec.effectiveFrom, scope: rec.scope, description: rec.description });
  }
  const toleranceNote = typeof value.toleranceNote === "string" ? value.toleranceNote : undefined;
  return { format, phases, toleranceNote };
}

export async function getEffectiveBeEinvoicingMandateSchedule(
  asOf?: string,
): Promise<(BeEinvoicingMandateSchedule & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(BE_EINVOICING_MANDATE_SCHEDULE_RULE, asOf);
  if (!rule) return null;
  const parsed = parseBeEinvoicingMandateSchedule(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/**
 * Belgium's own eligibility check is the simplest of the four EU country packs: every
 * phase applies uniformly to every VAT-registered business once its own date passes --
 * unlike Germany/France/Poland, no turnover threshold or size category narrows it further.
 * `isVatRegisteredInBelgium: null` (unknown) makes every phase's own applicability `null`
 * too (never silently assumed either way -- backlog rule 11); `false` makes every phase
 * `false` (genuinely out of scope, not merely "not yet due").
 */
export function determineActiveBeEinvoicingPhases(
  schedule: BeEinvoicingMandateSchedule,
  asOf: string,
  profile: BeEinvoicingBusinessProfile,
): { phase: BeEinvoicingMandatePhase; applies: boolean | null }[] {
  return schedule.phases.map((phase) => {
    if (profile.isVatRegisteredInBelgium == null) return { phase, applies: null };
    if (!profile.isVatRegisteredInBelgium) return { phase, applies: false };
    return { phase, applies: phase.effectiveFrom <= asOf };
  });
}
