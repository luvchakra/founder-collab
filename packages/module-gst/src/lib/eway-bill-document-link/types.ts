import type { EwayBillEligibilityResult } from "../eway-bill-eligibility/types";
import type { EwayBillMovementContext } from "../eway-bill-movement/queries";
import type { EwayBill } from "../eway-bill/types";

/**
 * COMPLY-P0-06.4 (Document Link): "Link e-way bill to source transaction." The single
 * combined picture of one document's whole e-way bill story -- everything COMPLY-P0-06.1
 * (eligibility), COMPLY-P0-06.2 (movement data), and COMPLY-P0-06.3/S-2 (generation
 * history) each already know separately about the SAME document, read together for the
 * first time. Never a new persisted concept of its own (backlog §5's own "no duplicate
 * transaction masters" -- this is a read-time join, not a table) and never a claim that a
 * document "is compliant" (backlog rule 11) -- `eligibility`/`movement`/`generation` are
 * surfaced as the separate facts they are, exactly as each of those stories already
 * defined them, not smoothed into one verdict.
 */
export type EwayBillDocumentLink = {
  documentId: string;
  eligibility: EwayBillEligibilityResult;
  movement: EwayBillMovementContext;
  /** The `gst.eway_bills` generation-history row for this document, or `null` if none has
   * ever been generated. */
  generation: EwayBill | null;
  /** True once a real (non-cancelled) e-way bill exists for this document -- the point at
   * which COMPLY-P0-06.2's own movement data becomes LINKED to that generated e-way bill
   * and is refused further edits (`upsertEwayBillMovement` enforces this; see
   * `isEwayBillGenerated`'s own docstring for why a cancelled bill doesn't count). */
  locked: boolean;
};
