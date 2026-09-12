import { determineEuVatTreatment } from "./determine";
import { getEffectiveOssThreshold } from "./oss-ioss";
import type { EuVatDetermineResult } from "./types";

/**
 * COMPLY-P1-01.3/01.4 orchestrator: resolves the OSS threshold rule for `asOf` and calls
 * the pure `determineEuVatTreatment` -- the same "queries.ts resolves real state, determine.ts
 * decides pure logic over it" split every other determination in this module already uses
 * (`gst-tax-determination/{queries,determine}.ts`, `place-of-supply/{queries,determine}.ts`).
 *
 * Always attempts the DB lookup, but an unresolved threshold (`null`) is passed straight
 * through to `determineEuVatTreatment` rather than short-circuiting here -- a domestic,
 * export, or B2B sale never needed the threshold in the first place and must not be
 * reported `incomplete` just because a fact it never used failed to resolve; only a B2C
 * intra-EU sale that actually reaches that branch turns an unresolved threshold into
 * `incomplete: true` (see that function's own logic).
 */
export async function determineEuVatTreatmentForSale(
  input: {
    sellerCountry: string;
    buyerCountry: string;
    buyerVatIdValidated: boolean;
    cumulativeEuDistanceSalesEur?: number | null;
  },
  asOf?: string,
): Promise<EuVatDetermineResult> {
  const threshold = await getEffectiveOssThreshold(asOf);
  return determineEuVatTreatment({ ...input, ossThresholdEur: threshold?.thresholdEur ?? null });
}
