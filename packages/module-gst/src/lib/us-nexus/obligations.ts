import type { RegistrationObligationResult } from "./types";

/**
 * COMPLY-P1-02.4 (Sales Tax Registration Obligations): combines economic nexus
 * (COMPLY-P1-02.2) and physical nexus (COMPLY-P1-02.3) into one per-state registration
 * signal -- a business owes a state sales tax registration if it has EITHER kind of nexus
 * there (they are independent, alternative legal bases, never both required at once).
 * Pure, synchronous -- both inputs are already-resolved facts, the same
 * "combine pre-resolved signals" shape `lib/risk/detect.ts`'s own multi-signal detectors
 * already use.
 */
export function determineRegistrationObligation(
  state: string,
  economicNexus: boolean | null,
  physicalNexus: boolean | null,
): RegistrationObligationResult {
  if (economicNexus === true || physicalNexus === true) {
    const reasons: string[] = [];
    if (economicNexus === true) reasons.push("economic nexus");
    if (physicalNexus === true) reasons.push("physical nexus");
    return {
      state,
      economicNexus,
      physicalNexus,
      obligated: true,
      reason: `Registration obligation likely in ${state}: ${reasons.join(" and ")} established.`,
    };
  }

  if (economicNexus === false && physicalNexus === false) {
    return {
      state,
      economicNexus,
      physicalNexus,
      obligated: false,
      reason: `No known registration obligation in ${state}: neither economic nor physical nexus is established.`,
    };
  }

  return {
    state,
    economicNexus,
    physicalNexus,
    obligated: null,
    reason: `Cannot yet confirm a registration obligation in ${state} -- at least one of economic or physical nexus is still unknown, and neither known signal already proves an obligation.`,
  };
}
