import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { FrEinvoicingBusinessProfile, FrEinvoicingMandatePhase, FrEinvoicingMandateSchedule } from "./types";

export const FR_EINVOICING_MANDATE_SCHEDULE_RULE: TaxRuleLineage = {
  country: "FR",
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "einvoicing_b2b_mandate_schedule",
};

export function parseFrEinvoicingMandateSchedule(value: Record<string, unknown>): FrEinvoicingMandateSchedule | null {
  const format = typeof value.format === "string" ? value.format : "";
  const phasesRaw = value.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) return null;

  const phases: FrEinvoicingMandatePhase[] = [];
  for (const p of phasesRaw) {
    if (!p || typeof p !== "object") return null;
    const rec = p as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.effectiveFrom !== "string" || typeof rec.scope !== "string" || typeof rec.description !== "string") {
      return null;
    }
    phases.push({ key: rec.key as FrEinvoicingMandatePhase["key"], effectiveFrom: rec.effectiveFrom, scope: rec.scope, description: rec.description });
  }
  const enforcementNote = typeof value.enforcementNote === "string" ? value.enforcementNote : undefined;
  return { format, phases, enforcementNote };
}

export async function getEffectiveFrEinvoicingMandateSchedule(
  asOf?: string,
): Promise<(FrEinvoicingMandateSchedule & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(FR_EINVOICING_MANDATE_SCHEDULE_RULE, asOf);
  if (!rule) return null;
  const parsed = parseFrEinvoicingMandateSchedule(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/**
 * Which of France's own three rollout phases are already in effect as of `asOf`, given a
 * business's own declared INSEE company-size category. `reception_all` applies to every
 * business once its date passes. `issuance_large_mid` applies only to GE/ETI; `issuance_small`
 * only to PME/TPE -- an unknown `companySize` makes BOTH issuance phases `null` (genuinely
 * unknown which one, if either, currently applies), never silently `false` (backlog rule
 * 11, "never understate an obligation").
 */
export function determineActiveFrEinvoicingPhases(
  schedule: FrEinvoicingMandateSchedule,
  asOf: string,
  profile: FrEinvoicingBusinessProfile,
): { phase: FrEinvoicingMandatePhase; applies: boolean | null }[] {
  return schedule.phases.map((phase) => {
    if (phase.effectiveFrom > asOf) return { phase, applies: false };
    if (phase.key === "reception_all") return { phase, applies: true };
    if (profile.companySize == null) return { phase, applies: null };
    if (phase.key === "issuance_large_mid") return { phase, applies: profile.companySize === "GE" || profile.companySize === "ETI" };
    return { phase, applies: profile.companySize === "PME" || profile.companySize === "TPE" };
  });
}
