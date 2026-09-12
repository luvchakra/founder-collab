import { createClient } from "../../db/server";
import { getTaxDeterminationById } from "./queries";
import type { TaxDetermination } from "./types";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P0-10.4 (Source Traceability). Closes a gap flagged by name at the moment
 * `gst.tax_determinations.rule_refs` was created (COMPLY-P0-02.5's own migration
 * comment): "the traceability hook backlog rule 14 / COMPLY-P0-07.4 'Return Drill-Down' /
 * COMPLY-P0-10.4 'Source Traceability' will build on later." `rule_refs` has always
 * stored the `gst.tax_rules.id` values a determination cited, but nothing anywhere in
 * this module has ever resolved those bare ids back into the actual rule content (which
 * `rule_key`, which `value`, which `source` citation, which effective-dated version) a
 * human reviewing a computed tax result would actually need to see. This is that
 * resolution.
 *
 * **Deliberately narrow scope, not a general "explain everything" traceability engine
 * (backlog rule 5)**: every OTHER "why" trail already built elsewhere in this module
 * already carries its own inline traceability as part of its own story --
 * `EinvoiceStatusResult` already surfaces `mandated`/`deadlineStatus`/`einvoiceRowStatus`
 * (COMPLY-P0-05.6), `effectiveImsStatus()` already surfaces which real fact produced its
 * output (COMPLY-P0-08.4), `explainSupplierMatch()` already returns real, sourced
 * candidate causes (COMPLY-P0-08.3). This story's own incremental job is specifically the
 * ONE gap two prior migrations already named by number and left open -- rule_refs -> real
 * rule rows -- not re-litigating traceability everywhere else it already exists.
 */

export type TaxDeterminationSources = {
  determination: TaxDetermination;
  /** The actual `gst.tax_rules` rows `determination.rule_refs` cited, each already
   * pinning one specific version/effective-date range/source citation -- real regulatory
   * facts, not a re-derivation of them (backlog rule 12: never blur a fact with a
   * calculated result). A ref id that no longer resolves to any row (should not happen in
   * practice -- `gst.tax_rules` rows are never deleted, only superseded -- but not assumed
   * impossible) is simply absent from this list rather than causing the whole lookup to
   * fail; `rules.length` may therefore legitimately be less than
   * `determination.rule_refs.length`, and a caller comparing the two can detect that.
   */
  rules: TaxRule[];
};

/** Resolves a bare list of `gst.tax_rules.id` values into their real rows. `gst.tax_rules`
 * has no `business_id` (it is platform-wide regulatory content, COMPLY-P0-02.3's own
 * design) -- RLS gates read access on the calling user belonging to ANY gst-licensed
 * business, not a specific one, so this needs no `businessId` parameter of its own. */
export async function resolveRuleRefs(ruleRefIds: string[]): Promise<TaxRule[]> {
  if (ruleRefIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("tax_rules").select("*").in("id", ruleRefIds);
  if (error) throw error;
  return data;
}

/**
 * The orchestrator: one determination plus the real rule content behind it. `null` when
 * the determination itself doesn't exist for this business -- "nothing to trace,"
 * matching every other document-keyed orchestrator in this module.
 */
export async function getTaxDeterminationSources(businessId: string, determinationId: string): Promise<TaxDeterminationSources | null> {
  const determination = await getTaxDeterminationById(businessId, determinationId);
  if (!determination) return null;
  const rules = await resolveRuleRefs(determination.rule_refs);
  return { determination, rules };
}
