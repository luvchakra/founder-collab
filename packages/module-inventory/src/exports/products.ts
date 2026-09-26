// EXP-INV-02 -- Products export (/inventory/products).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import type { Product } from "../lib/products/types";
import { listActiveSupplierNamesForExport, listCategoryNamesForExport, listProductsForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, canViewCost, humanize, money, percentFraction } from "./shared";

/**
 * The whole catalogue, as the page lists it (the page has no filters; its `imported`/
 * `skipped` params are a flash message, not a filter). Cost price is a column only for
 * users holding `inventory.view_cost` -- for everyone else it is absent from the file,
 * and the query masks it as well. Supplier names follow the page: active suppliers only.
 */
export const inventoryProductsExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.products",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const costVisible = await canViewCost(businessId);
    const [products, categories, suppliers] = await Promise.all([
      listProductsForExport(businessId, costVisible),
      listCategoryNamesForExport(businessId),
      listActiveSupplierNamesForExport(businessId),
    ]);

    const columns: ExportColumn<Product>[] = [
      { key: "sku", header: "SKU", getValue: (p) => p.sku ?? "" },
      { key: "name", header: "Name", getValue: (p) => p.name },
      { key: "brand", header: "Brand", getValue: (p) => p.brand ?? "" },
      { key: "category", header: "Category", getValue: (p) => (p.category_id ? (categories.get(p.category_id) ?? "") : "") },
      { key: "supplier", header: "Supplier", getValue: (p) => (p.supplier_id ? (suppliers.get(p.supplier_id) ?? "") : "") },
      { key: "unit", header: "Unit", getValue: (p) => p.unit },
      { key: "hsn", header: "HSN code", getValue: (p) => p.hsn_code ?? "" },
      { key: "tax_rate", header: "Tax rate", type: "percent", getValue: (p) => percentFraction(p.tax_rate) },
      { key: "barcode", header: "Barcode", getValue: (p) => p.barcode ?? "" },
      money<Product>("selling_price", "Selling price", (p) => p.selling_price),
      ...(costVisible ? [money<Product>("cost_price", "Cost price", (p) => p.cost_price)] : []),
      { key: "reorder_point", header: "Reorder point", type: "number", getValue: (p) => p.reorder_point },
      { key: "reorder_quantity", header: "Reorder quantity", type: "number", getValue: (p) => p.reorder_quantity },
      { key: "status", header: "Status", getValue: (p) => humanize(p.status) },
      { key: "created", header: "Created", type: "datetime", getValue: (p) => p.created_at },
    ];

    return {
      module: "inventory",
      resource: "products",
      title: "Inventory products",
      sheets: [{ sheetName: "Products", columns, rows: products }],
    };
  },
};
