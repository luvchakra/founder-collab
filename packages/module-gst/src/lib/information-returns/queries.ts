import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { determineForm1099Obligation } from "./determine";
import { getEffectiveEfileThreshold, getEffectiveForm1099Threshold } from "./rules";
import type { Form1099ReportingSummary, VendorPaymentTotal } from "./types";

/**
 * COMPLY-P1-02.8: reads `core.payments` (a business's own OUTGOING payments) directly --
 * checked `docs/plan/00-MASTER-PLAN.md` §5 first (backlog rule 1/5): "Payment |
 * core.payments + core.payment_allocations" is already core-owned; this story does not
 * duplicate it. Scoped to parties holding the `supplier` or `vendor` role
 * (`core.party_roles`, the same canonical role vocabulary COMPLY-P0-03.4's own party tax
 * context already relies on) -- a payment to a `customer`-role party (a refund, say) is
 * never a 1099-reportable vendor payment.
 *
 * **A real, named scope limitation**: this reads `core.payments` only. `fsm.expenses` (a
 * second real source of vendor/contractor payments, FSM-schema-owned) is NOT read here --
 * `fsm` is a separate module's own schema, and CLAUDE.md's own cross-module mechanisms
 * only permit reading `core` directly or calling another module's `contract/index.ts`;
 * `module-fsm` exposes no such contract function for vendor payment totals today. Flagged
 * as a concrete, named follow-up (the same "flag the missing cross-module wiring, don't
 * build it speculatively" precedent COMPLY-P0-04.3 already set for `module-inventory`'s own
 * product form), not silently worked around by reaching into another module's schema.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const VENDOR_ROLES = ["supplier", "vendor"] as const;

/** Every vendor/supplier party this business paid at least once during `calendarYear`
 * (a plain 4-digit year, e.g. `2026`), with its own cumulative total and payment count. */
export async function getVendorPaymentTotals(businessId: string, calendarYear: number): Promise<VendorPaymentTotal[]> {
  const core = await coreClient();
  const yearStart = `${calendarYear}-01-01`;
  const yearEnd = `${calendarYear}-12-31`;

  const rolesRes = await core.from("party_roles").select("party_id").eq("business_id", businessId).in("role", VENDOR_ROLES);
  if (rolesRes.error) throw rolesRes.error;
  const vendorPartyIds = [...new Set(rolesRes.data.map((r) => r.party_id as string))];
  if (vendorPartyIds.length === 0) return [];

  const [paymentsRes, partiesRes] = await Promise.all([
    core.from("payments").select("party_id, amount").eq("business_id", businessId).in("party_id", vendorPartyIds).gte("payment_date", yearStart).lte("payment_date", yearEnd),
    core.from("parties").select("id, name, kind").in("id", vendorPartyIds),
  ]);
  if (paymentsRes.error) throw paymentsRes.error;
  if (partiesRes.error) throw partiesRes.error;

  const partyById = new Map(partiesRes.data.map((p) => [p.id as string, p]));
  const totals = new Map<string, { totalPaidUsd: number; paymentCount: number }>();
  for (const payment of paymentsRes.data) {
    const partyId = payment.party_id as string;
    const existing = totals.get(partyId) ?? { totalPaidUsd: 0, paymentCount: 0 };
    existing.totalPaidUsd += Number(payment.amount);
    existing.paymentCount += 1;
    totals.set(partyId, existing);
  }

  const result: VendorPaymentTotal[] = [];
  for (const [partyId, total] of totals) {
    const party = partyById.get(partyId);
    result.push({
      partyId,
      partyName: party?.name ?? "Unknown party",
      partyKind: (party?.kind as "person" | "company" | undefined) ?? "company",
      totalPaidUsd: total.totalPaidUsd,
      paymentCount: total.paymentCount,
    });
  }
  return result;
}

/**
 * The full 1099 reporting summary for one calendar year -- every vendor this platform can
 * see payments for, each with its own determination, plus a best-effort (necessarily
 * lower-bound, see `types.ts`'s own docstring) e-file-required signal. `asOfDate` selects
 * which version of each threshold rule applies -- defaults to the LAST day of the calendar
 * year (a 1099's own reporting threshold is evaluated against payments made DURING that
 * year, so the rule in effect at year-end is the correct one to apply, matching how a
 * mid-year threshold change like the OBBBA's own 1-Jan-2026 effective date is meant to be
 * read: it governs payments made in 2026 and later, not retroactively).
 */
export async function getForm1099ReportingSummary(businessId: string, calendarYear: number, asOfDate?: string): Promise<Form1099ReportingSummary> {
  const effectiveAsOf = asOfDate ?? `${calendarYear}-12-31`;

  const [vendors, thresholdRule, efileRule] = await Promise.all([
    getVendorPaymentTotals(businessId, calendarYear),
    getEffectiveForm1099Threshold(effectiveAsOf),
    getEffectiveEfileThreshold(effectiveAsOf),
  ]);

  const determinations = vendors.map((vendor) => determineForm1099Obligation(vendor, thresholdRule));
  const reportableCount = determinations.filter((d) => d.obligated === true).length;
  const efileRequired = efileRule ? reportableCount >= efileRule.thresholdCount : null;

  return {
    businessId,
    calendarYear,
    asOfDate: effectiveAsOf,
    determinations,
    reportableCount,
    efileThresholdCount: efileRule?.thresholdCount ?? null,
    efileRequired,
    notModeled: [
      "fsm.expenses -- a second real source of vendor/contractor payments, FSM-schema-owned -- is not read (no module-fsm contract function exposes it yet).",
      "Corporate entity type for company-kind parties (C-corp/S-corp payments are typically 1099-exempt, with real exceptions like attorneys) -- not tracked by this platform, so company-kind vendors are always reported unresolved rather than guessed.",
      "The real IRS e-file threshold aggregates EVERY information-return type a filer issues (W-2s, the full 1099 series, and others); reportableCount here is a lower bound covering only 1099-shaped vendor payments this platform can see.",
      "1099-K (third-party payment network) and other information-return types beyond 1099-NEC/MISC-shaped vendor payments.",
    ],
  };
}
