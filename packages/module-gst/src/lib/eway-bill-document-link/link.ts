import type { EwayBill } from "../eway-bill/types";

/**
 * COMPLY-P0-06.4 (Document Link): "Link e-way bill to source transaction." The one piece
 * of shared logic both this story's own combined read (`queries.ts`) and
 * COMPLY-P0-06.2's own movement-data mutation need to agree on: whether a document's
 * e-way bill has actually been GENERATED (a real government identifier exists) and is
 * still ACTIVE (not cancelled) -- extracted as its own pure, tested function so the two
 * call sites can never silently drift out of sync on what "generated" means.
 *
 * A cancelled e-way bill does NOT count as generated for this purpose -- once cancelled,
 * the movement facts that led to it are no longer binding on anything real, so editing
 * them again (to prepare a fresh e-way bill for the same document, say) is allowed again.
 */
export function isEwayBillGenerated(ewayBill: EwayBill | null): boolean {
  return ewayBill !== null && ewayBill.status !== "cancelled";
}
