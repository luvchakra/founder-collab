/**
 * COMPLY-P0-04.3 (HSN/SAC): "Classification and validation." `core.items.hsn_code`
 * already exists and is already read by this module (`queries.ts`'s own
 * `getItemTaxContext`/`listItemTaxContexts`, COMPLY-P0-03.2) -- per
 * `docs/plan/00-MASTER-PLAN.md` §5 it is `core`-owned, shared by inventory/fsm/gst, and
 * "never duplicated per module." This story does not touch that column or its existing
 * edit surface (`module-inventory`'s own `product-modal.tsx` free-text input) at all --
 * doing so would mean editing another module's own source, out of scope for a run
 * restricted to `module-gst`. What this module CAN own is the validation/classification
 * logic itself: whether a given code is well-formed, and whether it's the right KIND of
 * code (HSN for goods, SAC for services) for the item it's attached to.
 *
 * A structural check only, not a lookup against the real HSN/SAC master code list (a
 * government-maintained catalog of many thousands of entries this run has no way to
 * source accurately or keep current) -- validating that a code is SHAPED like a real
 * HSN/SAC code, not that the specific digits are a real, currently-assigned commodity/
 * service code. Distinguishing that structural check (a software rule) from an actual
 * regulatory fact is exactly backlog rule 12's own discipline: this file never claims a
 * code IS correct, only that it isn't obviously wrong.
 *
 * Two GSTN conventions this file relies on, both stable, structural, and independent of
 * any turnover-based mandate (which digit count is REQUIRED for a given business depends
 * on its aggregate turnover slab -- a real regulatory fact that belongs in a versioned,
 * source-cited `gst.tax_rules` row, COMPLY-P0-02.3, once a story actually needs to enforce
 * it, not hard-coded here):
 * - HSN codes are numeric, 2/4/6/8 digits (the granularity a business is allowed to use at
 *   all, regardless of which digit count their own turnover slab currently mandates).
 * - Service Accounting Codes are always 6-digit and begin with "99" -- GSTN's own
 *   published SAC list runs 9954xx-9997xx; the underlying Harmonized System's chapter 99
 *   is otherwise unused for goods, which is exactly why India repurposed it for services
 *   under GST. This makes "starts with 99, 6 digits" a reliable, documented way to tell
 *   the two code families apart structurally, not a guess.
 */

import type { ItemKind, ItemTaxContext } from "./types";

export type HsnSacRequirement = "hsn" | "sac" | "not_applicable";
export type HsnSacValidationStatus = "valid" | "invalid" | "missing" | "not_applicable";

export type HsnSacValidationResult = {
  requirement: HsnSacRequirement;
  status: HsnSacValidationStatus;
  /** Present for "invalid"/"missing" -- a plain-language explanation, never a claim of
   * legal correctness (backlog rule 12: this is a software rule's explanation, not a
   * regulatory fact or a calculated result). */
  reason?: string;
};

const DIGITS_ONLY = /^[0-9]+$/;
const VALID_HSN_LENGTHS = new Set([2, 4, 6, 8]);

/** What kind of code an item's own `kind` calls for. `labour`/`expense` items are
 * internal line-item kinds (a technician's time, a pass-through cost) that GST invoicing
 * doesn't require an HSN/SAC for -- flagging one "missing" on those would be a false
 * positive, not a real data-quality issue. */
export function hsnSacRequirementForKind(kind: ItemKind): HsnSacRequirement {
  if (kind === "service") return "sac";
  if (kind === "labour" || kind === "expense") return "not_applicable";
  return "hsn"; // "good" | "part"
}

/** Structural classification of a code, independent of what kind of item it's attached
 * to -- `null` when it matches neither shape at all (non-numeric, or a numeric string of
 * some other length). */
export function classifyHsnSacCode(code: string): "hsn" | "sac" | null {
  const trimmed = code.trim();
  if (!DIGITS_ONLY.test(trimmed)) return null;
  if (trimmed.length === 6 && trimmed.startsWith("99")) return "sac";
  if (VALID_HSN_LENGTHS.has(trimmed.length)) return "hsn";
  return null;
}

/**
 * Validates one code against what its item's `kind` requires. Never throws -- every input
 * (including `null`/blank) maps to a `HsnSacValidationResult`, so a caller building a
 * readiness list over many items never needs its own try/catch per item.
 */
export function validateHsnSacCode(kind: ItemKind, code: string | null): HsnSacValidationResult {
  const requirement = hsnSacRequirementForKind(kind);
  if (requirement === "not_applicable") {
    return { requirement, status: "not_applicable" };
  }

  const trimmed = code?.trim() ?? "";
  if (!trimmed) {
    return {
      requirement,
      status: "missing",
      reason: requirement === "sac" ? "No SAC code set for this service." : "No HSN code set for this item.",
    };
  }

  if (!DIGITS_ONLY.test(trimmed)) {
    return { requirement, status: "invalid", reason: "HSN/SAC codes contain digits only." };
  }

  const classification = classifyHsnSacCode(trimmed);

  if (requirement === "sac") {
    if (classification !== "sac") {
      return {
        requirement,
        status: "invalid",
        reason: "Services need a 6-digit Services Accounting Code (SAC) starting with 99.",
      };
    }
    return { requirement, status: "valid" };
  }

  // requirement === "hsn"
  if (classification !== "hsn") {
    const looksLikeSac = trimmed.length === 6 && trimmed.startsWith("99");
    return {
      requirement,
      status: "invalid",
      reason: looksLikeSac
        ? "This looks like a Services Accounting Code (SAC), not an HSN code -- GSTN reserves codes starting with 99 for services."
        : "HSN codes are 2, 4, 6 or 8 digits.",
    };
  }
  return { requirement, status: "valid" };
}

/** Convenience wrapper over `validateHsnSacCode` for an already-fetched
 * `ItemTaxContext` (COMPLY-P0-03.2's own read shape) -- the form most future callers
 * (a classification-readiness list, a document-line validation check) actually have on
 * hand, so they don't need to destructure `kind`/`hsnCode` themselves. */
export function validateItemHsnSac(item: Pick<ItemTaxContext, "kind" | "hsnCode">): HsnSacValidationResult {
  return validateHsnSacCode(item.kind, item.hsnCode);
}
