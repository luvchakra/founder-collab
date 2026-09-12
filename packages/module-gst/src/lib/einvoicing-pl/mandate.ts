import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type { PlEinvoicingBusinessProfile, PlEinvoicingMandatePhase, PlEinvoicingMandateSchedule } from "./types";

export const PL_EINVOICING_MANDATE_SCHEDULE_RULE: TaxRuleLineage = {
  country: "PL",
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "einvoicing_b2b_mandate_schedule",
};

export function parsePlEinvoicingMandateSchedule(value: Record<string, unknown>): PlEinvoicingMandateSchedule | null {
  const format = typeof value.format === "string" ? value.format : "";
  const phasesRaw = value.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) return null;

  const phases: PlEinvoicingMandatePhase[] = [];
  for (const p of phasesRaw) {
    if (!p || typeof p !== "object") return null;
    const rec = p as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.effectiveFrom !== "string" || typeof rec.scope !== "string" || typeof rec.description !== "string") {
      return null;
    }
    phases.push({
      key: rec.key as PlEinvoicingMandatePhase["key"],
      effectiveFrom: rec.effectiveFrom,
      scope: rec.scope,
      description: rec.description,
      thresholdPln: typeof rec.thresholdPln === "number" ? rec.thresholdPln : undefined,
    });
  }
  const enforcementNote = typeof value.enforcementNote === "string" ? value.enforcementNote : undefined;
  return { format, phases, enforcementNote };
}

export async function getEffectivePlEinvoicingMandateSchedule(
  asOf?: string,
): Promise<(PlEinvoicingMandateSchedule & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(PL_EINVOICING_MANDATE_SCHEDULE_RULE, asOf);
  if (!rule) return null;
  const parsed = parsePlEinvoicingMandateSchedule(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/**
 * Poland's own three-tier gating: `issuance_large_taxpayers` needs a known turnover over
 * its own PLN threshold; `issuance_other_vat_registered` needs to know the business is NOT
 * a micro-entrepreneur (large taxpayers are also "other VAT-registered businesses" and may
 * legitimately show `true` for both phases once each one's own date has passed --
 * consistent, not contradictory: they were simply obligated earlier under the large-
 * taxpayer phase); `issuance_micro_entrepreneurs` needs to know the business IS one. Any
 * missing fact makes the phase(s) that need it `null` (unknown), never silently `false`
 * (backlog rule 11).
 */
export function determineActivePlEinvoicingPhases(
  schedule: PlEinvoicingMandateSchedule,
  asOf: string,
  profile: PlEinvoicingBusinessProfile,
): { phase: PlEinvoicingMandatePhase; applies: boolean | null }[] {
  return schedule.phases.map((phase) => {
    if (phase.effectiveFrom > asOf) return { phase, applies: false };

    if (phase.key === "issuance_large_taxpayers") {
      if (profile.turnoverPln == null) return { phase, applies: null };
      return { phase, applies: profile.turnoverPln > (phase.thresholdPln ?? 0) };
    }

    if (phase.key === "issuance_micro_entrepreneurs") {
      if (profile.isMicroEntrepreneur == null) return { phase, applies: null };
      return { phase, applies: profile.isMicroEntrepreneur };
    }

    // issuance_other_vat_registered: excludes micro-entrepreneurs only.
    if (profile.isMicroEntrepreneur == null) return { phase, applies: null };
    return { phase, applies: !profile.isMicroEntrepreneur };
  });
}
