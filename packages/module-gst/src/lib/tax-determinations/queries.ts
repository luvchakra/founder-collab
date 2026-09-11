import { createClient } from "../../db/server";
import type { TaxDetermination } from "./types";

/** Every determination ever computed for one specific transaction (`sourceModule` +
 * `sourceReference` -- see the migration's own comment for why this is an opaque
 * reference, not a typed FK yet), newest first -- a transaction can be recomputed
 * (a corrected line, a superseded tax rule, ...), and every prior snapshot stays
 * inspectable (backlog rule 13, "preserve historical filing/evidence state"). */
export async function listTaxDeterminations(
  businessId: string,
  sourceModule: string,
  sourceReference: string,
): Promise<TaxDetermination[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_determinations")
    .select("*")
    .eq("business_id", businessId)
    .eq("source_module", sourceModule)
    .eq("source_reference", sourceReference)
    .order("computed_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** The most recent determination for a transaction -- "what tax result is currently in
 * effect for this document," the shape most callers (a document view, a return
 * drill-down) actually want instead of the full history. `null` if nothing has been
 * computed for it yet. */
export async function getLatestTaxDetermination(
  businessId: string,
  sourceModule: string,
  sourceReference: string,
): Promise<TaxDetermination | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_determinations")
    .select("*")
    .eq("business_id", businessId)
    .eq("source_module", sourceModule)
    .eq("source_reference", sourceReference)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
