import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { DeEinvoicingBusinessProfile, DeEinvoicingMandatePhase, DeEinvoicingMandateSchedule } from "./types";

export const DE_EINVOICING_MANDATE_SCHEDULE_RULE: TaxRuleLineage = {
  country: "DE",
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "einvoicing_b2b_mandate_schedule",
};

/** Defensive parse of the versioned schedule's own jsonb `value` -- same
 * never-throw-never-guess posture as `parseRateSlabValue`/`parseEuVatStandardRateValue`. */
export function parseDeEinvoicingMandateSchedule(value: Record<string, unknown>): DeEinvoicingMandateSchedule | null {
  const format = typeof value.format === "string" ? value.format : "";
  const phasesRaw = value.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) return null;

  const phases: DeEinvoicingMandatePhase[] = [];
  for (const p of phasesRaw) {
    if (!p || typeof p !== "object") return null;
    const rec = p as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.effectiveFrom !== "string" || typeof rec.scope !== "string" || typeof rec.description !== "string") {
      return null;
    }
    phases.push({
      key: rec.key as DeEinvoicingMandatePhase["key"],
      effectiveFrom: rec.effectiveFrom,
      scope: rec.scope,
      description: rec.description,
      thresholdEur: typeof rec.thresholdEur === "number" ? rec.thresholdEur : undefined,
    });
  }
  return { format, phases };
}

export async function getEffectiveDeEinvoicingMandateSchedule(
  asOf?: string,
): Promise<(DeEinvoicingMandateSchedule & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(DE_EINVOICING_MANDATE_SCHEDULE_RULE, asOf);
  if (!rule) return null;
  const parsed = parseDeEinvoicingMandateSchedule(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/**
 * Which of Germany's own three rollout phases are ALREADY in effect as of `asOf`, given a
 * business's own declared prior-year turnover -- pure, synchronous, no DB access (the
 * `queries.ts`-style DB read already happened in `getEffectiveDeEinvoicingMandateSchedule`
 * above). `reception_all`/`issuance_all` apply to every business once their own date
 * passes; `issuance_large` only once `priorYearTurnoverEur` is both known AND over its own
 * threshold -- an unknown turnover means this phase's own applicability is `null`
 * (genuinely unknown), never silently treated as "not yet applicable" (backlog rule 11,
 * "never understate an obligation").
 */
export function determineActiveDeEinvoicingPhases(
  schedule: DeEinvoicingMandateSchedule,
  asOf: string,
  profile: DeEinvoicingBusinessProfile,
): { phase: DeEinvoicingMandatePhase; applies: boolean | null }[] {
  return schedule.phases.map((phase) => {
    if (phase.effectiveFrom > asOf) return { phase, applies: false };
    if (phase.key === "issuance_large") {
      if (profile.priorYearTurnoverEur == null) return { phase, applies: null };
      return { phase, applies: profile.priorYearTurnoverEur > (phase.thresholdEur ?? 0) };
    }
    return { phase, applies: true };
  });
}
