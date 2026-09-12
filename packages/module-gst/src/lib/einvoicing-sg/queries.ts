import { getEffectiveSgInvoiceNowMandateSchedule, determineActiveSgInvoiceNowPhases } from "./mandate";
import { getInvoiceNowTransmission } from "./transmissions";
import { determineSgInvoiceNowTransmissionStatus, type SgInvoiceNowTransmissionStatusResult } from "./transmission-status";
import type { SgInvoiceNowBusinessProfile, SgInvoiceNowPhaseApplicability } from "./types";

/**
 * COMPLY-P1-04.6 (Transmission Status): the orchestrator -- resolves the currently-
 * effective InvoiceNow mandate schedule and this business's own active phases (COMPLY-
 * P1-04.3), reads whether a `gst.invoicenow_transmissions` row already exists for this
 * document (COMPLY-P1-04.5), and hands the combined facts to the pure
 * `determineSgInvoiceNowTransmissionStatus`. `profile` is caller-DECLARED (backlog rule
 * 12), the same posture `determineActiveDeEinvoicingPhases`'s own caller-supplied
 * `DeEinvoicingBusinessProfile` already takes -- this module stores no InvoiceNow-
 * specific business profile of its own.
 *
 * Aggregates the per-phase `applies` results into one `required` fact: `true` if ANY
 * phase applies, `false` only if every phase resolved and NONE applies, `null` (unknown)
 * if at least one phase's own applicability is unknown and none that resolved definitely
 * applies -- never collapses an unknown phase into a `false` "not required" answer.
 */
export async function getSgInvoiceNowTransmissionStatus(
  businessId: string,
  documentId: string,
  profile: SgInvoiceNowBusinessProfile,
  asOf?: string,
): Promise<SgInvoiceNowTransmissionStatusResult> {
  const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);

  const [schedule, transmission] = await Promise.all([
    getEffectiveSgInvoiceNowMandateSchedule(asOfDate),
    getInvoiceNowTransmission(businessId, documentId),
  ]);

  const required = schedule ? aggregatePhaseApplicability(determineActiveSgInvoiceNowPhases(schedule, asOfDate, profile)) : null;

  return determineSgInvoiceNowTransmissionStatus({
    required,
    transmissionRowStatus: transmission?.status ?? null,
  });
}

function aggregatePhaseApplicability(phases: SgInvoiceNowPhaseApplicability[]): boolean | null {
  if (phases.some((p) => p.applies === true)) return true;
  if (phases.some((p) => p.applies === null)) return null;
  return false;
}
