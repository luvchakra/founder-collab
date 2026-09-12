import type { GovernmentResponseRecord } from "./types";

/** Pure: newest-first by `receivedAt` -- extracted from `queries.ts`'s own orchestrator
 * so the ordering itself is independently testable without a database. */
export function sortGovernmentResponses(records: GovernmentResponseRecord[]): GovernmentResponseRecord[] {
  return [...records].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
