import { hasStateSalesTax } from "../compliance/us-states";
import { getEffectiveUsEconomicNexusThreshold } from "../tax-rules/us-sales-tax";
import { determineEconomicNexus } from "./economic";
import { determineRegistrationObligation } from "./obligations";
import { listActiveUsPhysicalNexusFacts } from "./physical";
import type { RegistrationObligationResult } from "./types";

/**
 * COMPLY-P1-02.4 (Sales Tax Registration Obligations) orchestrator: resolves each state's
 * own economic nexus threshold rule and this business's own declared physical-presence
 * facts, then combines them via the pure `determineRegistrationObligation`. Mirrors the
 * "queries.ts resolves real state, a pure function decides logic over it" split every other
 * determination in this module already uses.
 *
 * Evaluated states are the union of every state key in the caller-declared `perStateSales`
 * input (backlog rule 12 -- this platform has no per-state sales aggregation of its own
 * `core.documents` history to derive this from yet) and every state this business has an
 * active physical-presence fact for -- a business with physical nexus in a state it
 * declared no sales figures for (e.g. a warehouse in a state it hasn't shipped from yet)
 * must still surface as a real obligation signal, not be silently skipped for lack of a
 * sales number.
 *
 * A state with NO state-level sales tax at all (COMPLY-P1-02.1's own five NOMAD states) is
 * reported `obligated: false` outright, regardless of any declared nexus facts -- there is
 * no tax to register for, a structural fact, not an unresolved threshold.
 */
export async function getUsRegistrationObligations(
  businessId: string,
  perStateSales: Record<string, { salesUsd: number | null; transactionCount: number | null }>,
  asOf?: string,
): Promise<RegistrationObligationResult[]> {
  const physicalFacts = await listActiveUsPhysicalNexusFacts(businessId);
  const physicalStates = new Set(physicalFacts.map((f) => f.state));
  const states = new Set([...Object.keys(perStateSales), ...physicalStates]);

  const results: RegistrationObligationResult[] = [];
  for (const state of states) {
    const physicalNexus = physicalStates.has(state);

    if (!hasStateSalesTax(state)) {
      results.push({
        state,
        economicNexus: false,
        physicalNexus,
        obligated: false,
        reason: `${state} has no state-level sales tax -- no registration obligation exists regardless of nexus.`,
      });
      continue;
    }

    const threshold = await getEffectiveUsEconomicNexusThreshold(state, asOf);
    const sales = perStateSales[state];
    const economicNexus = threshold
      ? determineEconomicNexus({
          salesUsd: sales?.salesUsd ?? null,
          transactionCount: sales?.transactionCount ?? null,
          threshold,
        }).hasNexus
      : null;

    results.push(determineRegistrationObligation(state, economicNexus, physicalNexus));
  }

  return results;
}
