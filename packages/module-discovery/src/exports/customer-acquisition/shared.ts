// EXP-DISC-01..12 -- helpers shared by the Discovery customer-acquisition exports.
import { ExportDeniedError, type ExportContext } from "@cofounderai/core/exports/server";
import { getProduct, getWorkspaceForProduct } from "../../lib/tenancy/queries";
import type { Product, Workspace } from "../../lib/tenancy/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The offering (product) an offering-scoped page is showing, as the page's own URL names
 * it. Only ever a selector -- `resolveOffering` below decides whether it may be read. */
export function readProductId(params: URLSearchParams): string {
  return params.get("productId") ?? "";
}

/**
 * The same three checks every `offerings/[productId]/...` page makes before it reads
 * anything: the product exists for this user (RLS), it belongs to the business the export
 * was resolved for (`context.businessId`, from the slug -- never from the request), and it
 * has a workspace. The workspace id every Discovery query is then scoped by comes from
 * here and nowhere else. Anything else is "not found", exactly as the page 404s.
 */
export async function resolveOffering(
  context: ExportContext,
  productId: string,
): Promise<{ product: Product; workspace: Workspace }> {
  if (!UUID.test(productId)) throw new ExportDeniedError("Offering not found.", 404);
  const product = await getProduct(productId);
  if (!product || product.business_id !== context.businessId) {
    throw new ExportDeniedError("Offering not found.", 404);
  }
  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) throw new ExportDeniedError("Offering not found.", 404);
  return { product, workspace };
}

/** `{ id }` params that name a record under an offering (a prospect) get the same shape
 * check before they reach a query. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** A label from one of the product's own label maps; an unmapped value is shown as-is
 * rather than dropped, and a missing value stays blank. */
export function labelOf(map: Record<string, string>, value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return map[value] ?? value;
}

/** Fraction for a `percent` column -- blank, never 0, when there is nothing to divide by
 * (docs/design/data-exports.md rule 8). */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Whole days between an instant and now -- an opportunity's "age". */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

// Label maps the pages render inline (as local constants in their own .tsx files) and
// that no shared module exports -- repeated here with the same wording.

export const PROSPECT_STATUS_LABEL: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

export const PROSPECT_OUTCOME_LABEL: Record<string, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
};

export const LEVEL_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
};

/** Provenance vocabulary used in the "... basis" columns (§44): what kind of number or
 * statement a cell holds. */
export const BASIS = {
  recorded: "Recorded",
  calculated: "Calculated",
  aiDerived: "AI-derived",
  fitScore: "Calculated from ICP match and AI research signals",
} as const;

/** For a status another module reports as a raw code through its contract (no label map
 * may be imported across the module boundary): `estimate_sent` -> `Estimate sent`. */
export function humanize(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
