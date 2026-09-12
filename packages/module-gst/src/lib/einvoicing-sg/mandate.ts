import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";
import type {
  SgInvoiceNowBusinessProfile,
  SgInvoiceNowMandatePhase,
  SgInvoiceNowMandateSchedule,
  SgInvoiceNowPhaseApplicability,
} from "./types";

/**
 * COMPLY-P1-04.3 (InvoiceNow Eligibility): the versioned phase schedule, seeded by
 * `20260912600000_gst_tax_rules_sg_gst_seed.sql` -- see that migration's own comment for
 * full sourcing of all four phases/dates. Same "export the lineage as a constant" /
 * "one versioned schedule, phases as a jsonb array" shape `DE_EINVOICING_MANDATE_SCHEDULE_
 * RULE`/`parseDeEinvoicingMandateSchedule` (COMPLY-P1-01.6) already established.
 */
export const SG_INVOICENOW_MANDATE_SCHEDULE_RULE: TaxRuleLineage = {
  country: "SG",
  jurisdiction: null,
  regime: "GST",
  ruleKey: "invoicenow_mandate_schedule",
};

/** Defensive parse of the versioned schedule's own jsonb `value` -- same
 * never-throw-never-guess posture as `parseDeEinvoicingMandateSchedule`. */
export function parseSgInvoiceNowMandateSchedule(value: Record<string, unknown>): SgInvoiceNowMandateSchedule | null {
  const format = typeof value.format === "string" ? value.format : "";
  const phasesRaw = value.phases;
  if (!Array.isArray(phasesRaw) || phasesRaw.length === 0) return null;

  const phases: SgInvoiceNowMandatePhase[] = [];
  for (const p of phasesRaw) {
    if (!p || typeof p !== "object") return null;
    const rec = p as Record<string, unknown>;
    if (typeof rec.key !== "string" || typeof rec.effectiveFrom !== "string" || typeof rec.scope !== "string" || typeof rec.description !== "string") {
      return null;
    }
    phases.push({
      key: rec.key as SgInvoiceNowMandatePhase["key"],
      effectiveFrom: rec.effectiveFrom,
      scope: rec.scope,
      description: rec.description,
    });
  }
  return { format, phases };
}

export async function getEffectiveSgInvoiceNowMandateSchedule(
  asOf?: string,
): Promise<(SgInvoiceNowMandateSchedule & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(SG_INVOICENOW_MANDATE_SCHEDULE_RULE, asOf);
  if (!rule) return null;
  const parsed = parseSgInvoiceNowMandateSchedule(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000; // approximate, matching this module's
// own existing tolerance for "within N months" tests where no calendar-exact library is
// already in use elsewhere in this module (a business either clears this test by a wide
// margin or the exact day boundary is not the deciding fact of the determination).

function withinSixMonths(incorporationDate: string, gstRegistrationDate: string): boolean {
  const incorporated = new Date(`${incorporationDate}T00:00:00Z`).getTime();
  const registered = new Date(`${gstRegistrationDate}T00:00:00Z`).getTime();
  return registered - incorporated <= SIX_MONTHS_MS && registered >= incorporated;
}

/**
 * Which of Singapore's own four rollout phases are ALREADY in effect as of `asOf`, given a
 * business's own declared profile -- pure, synchronous, no DB access (the `queries.ts`-
 * style DB read already happened in `getEffectiveSgInvoiceNowMandateSchedule` above), the
 * same shape `determineActiveDeEinvoicingPhases` (COMPLY-P1-01.6) already established.
 *
 * - `soft_launch` applies to every business once its own date passes (voluntary, so
 *   "applies" here means "is open to," not "is required for" -- see the phase's own
 *   description).
 * - `new_voluntary_registrants_recent_incorporation` applies only when
 *   `registrationBasis === "voluntary"` AND both dates are known AND incorporation was
 *   within 6 months of the GST registration date -- unknown dates or an unknown
 *   registration basis leave this genuinely UNKNOWN (`null`), never guessed `false`.
 * - `all_new_voluntary_registrants` applies to every `"voluntary"` registrant once its
 *   own date passes; unknown `registrationBasis` is UNKNOWN, not `false`.
 * - `all_gst_registered_businesses` -- see `SgInvoiceNowPhaseApplicability`'s own
 *   docstring for why this is `null` (never `false`) for every business once this phase's
 *   own window has opened, regardless of `registrationBasis`.
 */
export function determineActiveSgInvoiceNowPhases(
  schedule: SgInvoiceNowMandateSchedule,
  asOf: string,
  profile: SgInvoiceNowBusinessProfile,
): SgInvoiceNowPhaseApplicability[] {
  return schedule.phases.map((phase) => {
    if (phase.effectiveFrom > asOf) return { phase, applies: false };

    switch (phase.key) {
      case "soft_launch":
        return { phase, applies: true };

      case "new_voluntary_registrants_recent_incorporation": {
        if (profile.registrationBasis === null) return { phase, applies: null };
        if (profile.registrationBasis !== "voluntary") return { phase, applies: false };
        if (!profile.incorporationDate || !profile.gstRegistrationDate) return { phase, applies: null };
        return { phase, applies: withinSixMonths(profile.incorporationDate, profile.gstRegistrationDate) };
      }

      case "all_new_voluntary_registrants": {
        if (profile.registrationBasis === null) return { phase, applies: null };
        return { phase, applies: profile.registrationBasis === "voluntary" };
      }

      case "all_gst_registered_businesses":
        return { phase, applies: null };
    }
  });
}
