import type { UsEconomicNexusThresholdValue } from "../tax-rules/us-sales-tax";

/** COMPLY-P1-02.2 (Economic Nexus Tracker) / COMPLY-P1-02.3 (Physical Nexus Inputs) /
 * COMPLY-P1-02.4 (Sales Tax Registration Obligations). */

export type EconomicNexusInput = {
  /** This business's own declared gross sales sourced to the state for the relevant
   * measurement period (current or prior calendar year, per that state's own statute --
   * WHICH period is a caller concern, not this pure function's) -- a caller-DECLARED fact
   * (backlog rule 12), the same "self-declared, not computed" posture
   * COMPLY-P1-01.3's own `cumulativeEuDistanceSalesEur` already takes; this platform has no
   * per-state sales aggregation of its own `core.documents` history to derive this from
   * yet. `null` means "not declared," never "zero." */
  salesUsd: number | null;
  /** Same caller-declared posture, for the transaction-COUNT prong a subset of states
   * still use. `null` means "not declared." Irrelevant (never read) when the resolved
   * threshold's own `thresholdLogic` is `"revenue_only"`. */
  transactionCount: number | null;
  threshold: UsEconomicNexusThresholdValue;
};

export type NexusDeterminationResult = {
  /** `null` (never a guessed `false`) whenever a fact this determination needs is itself
   * unknown AND the known facts alone cannot already prove the answer either way -- the
   * same "never understate an obligation" posture (backlog rule 11)
   * `determineEinvoiceEligibility`'s own India equivalent already established. */
  hasNexus: boolean | null;
  reason: string;
};

export type PhysicalPresenceType = "employee" | "office" | "warehouse" | "inventory" | "other";

export type PhysicalNexusFact = {
  id: string;
  businessId: string;
  state: string;
  presenceType: PhysicalPresenceType;
  notes: string | null;
  declaredAt: string;
};

export type RegistrationObligationResult = {
  state: string;
  economicNexus: boolean | null;
  physicalNexus: boolean | null;
  /** `true` if either kind of nexus is confirmed `true`; `false` only when BOTH are
   * confirmed `false` (neither kind of nexus exists, by the facts this business declared);
   * `null` whenever neither is confirmed `true` but at least one is still `null` --
   * "might still owe a registration, more facts needed," never silently cleared. */
  obligated: boolean | null;
  reason: string;
};
