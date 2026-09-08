// Hand-written rather than the generic CRUD factory: a single-fetch invoice needs its
// line items resolved and joined in application code -- this platform's compat views
// carry no real foreign keys between them for PostgREST to embed across (see
// stock/queries.ts's own precedent in module-inventory's UI-facing lib). Read-only:
// invoices are generated from a sales order via a workflow action
// (generate_sales_invoice), not created directly -- that action, plus credit notes, are
// a fast-follow once a real integration needs to drive them, same scoping as the
// original stockpilot-ai-ops resource this was promoted from.
import { createAdminClient } from "@cofounderai/core/db/admin";
import type { ApiKeyContext } from "@cofounderai/core/api-v1/auth.server";
import { ApiError, jsonResponse } from "@cofounderai/core/api-v1/response";

const LIST_SELECT =
  "id, invoice_number, invoice_date, customer_id, sales_order_id, subtotal, discount_amount, cgst_amount, sgst_amount, igst_amount, shipping_amount, total_amount, payment_status, created_at";
const SINGLE_SELECT = `${LIST_SELECT}, customer_gstin, billing_address, shipping_address`;

export async function handle(
  request: Request,
  ctx: ApiKeyContext,
  id: string | undefined,
  query: URLSearchParams,
): Promise<Response> {
  const db = createAdminClient({ schema: "inventory" });

  if (request.method === "GET" && !id) {
    const limit = Math.min(Math.max(Number(query.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(query.get("offset")) || 0, 0);
    const { data, error, count } = await db
      .from("sales_invoices")
      .select(LIST_SELECT, { count: "exact" })
      .eq("org_id", ctx.businessId)
      .order("invoice_date", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new ApiError(500, "internal_error", error.message);
    return jsonResponse({ data, meta: { limit, offset, count: count ?? data?.length ?? 0 } });
  }

  if (request.method === "GET" && id) {
    const { data: invoice, error } = await db
      .from("sales_invoices")
      .select(SINGLE_SELECT)
      .eq("org_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ApiError(500, "internal_error", error.message);
    if (!invoice) throw new ApiError(404, "not_found", "No sales invoice found with that id.");

    const { data: items, error: itemsError } = await db
      .from("sales_invoice_items")
      .select("id, product_id, hsn_code, quantity, unit_price, tax_rate, cgst_amount, sgst_amount, igst_amount")
      .eq("invoice_id", id)
      .order("created_at");
    if (itemsError) throw new ApiError(500, "internal_error", itemsError.message);

    return jsonResponse({ data: { ...invoice, items: items ?? [] } });
  }

  throw new ApiError(405, "method_not_allowed", `${request.method} is not supported here.`);
}
