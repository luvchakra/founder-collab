import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P1-02.8 (United States -- 1099 Information Returns): "federal information return
 * obligation tracking" -- which of this business's OWN vendors/contractors it may need to
 * issue a Form 1099-NEC/MISC to, based on cumulative payments this calendar year.
 */

export const US_INFORMATION_RETURNS_REGIME = "INFORMATION_RETURNS";

export type VendorPaymentTotal = {
  partyId: string;
  partyName: string;
  partyKind: "person" | "company";
  totalPaidUsd: number;
  paymentCount: number;
};

export type Form1099Determination = VendorPaymentTotal & {
  /** `false` for a `company`-kind party (this platform does not track corporate entity
   * type -- payments to most corporations are exempt from 1099-NEC reporting, with real
   * exceptions like attorneys, that this platform cannot distinguish -- backlog rule 11:
   * never guess in either direction) or when no threshold rule resolved for the given
   * date. */
  resolved: boolean;
  thresholdUsd: number | null;
  /** `null` only when `resolved` is `false`. */
  obligated: boolean | null;
  reason: string;
  ruleRefs: string[];
};

export type Form1099ReportingSummary = {
  businessId: string;
  calendarYear: number;
  asOfDate: string;
  determinations: Form1099Determination[];
  /** The aggregate e-file threshold question -- `null` when unresolved (no threshold rule
   * for the given date). The real IRS threshold aggregates EVERY information-return type a
   * filer issues (W-2s, the full 1099 series, and others); `reportableCount` below is
   * necessarily a LOWER BOUND (only the 1099-shaped vendor payments this platform can see),
   * so `efileRequired: false` is never a claim that e-filing is NOT required overall --
   * only that this platform's own visible count alone doesn't cross the threshold. */
  reportableCount: number;
  efileThresholdCount: number | null;
  efileRequired: boolean | null;
  notModeled: string[];
};

export type Form1099ThresholdRuleValue = { thresholdUsd: number; label: string };
export type EfileThresholdRuleValue = { thresholdCount: number; label: string };

export type ResolvedForm1099ThresholdRule = Form1099ThresholdRuleValue & { rule: TaxRule };
export type ResolvedEfileThresholdRule = EfileThresholdRuleValue & { rule: TaxRule };
