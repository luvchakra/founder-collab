import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-inventory's own self-description (SP-9; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "inventory" entry
 * `packages/module-registry/src/index.ts` declares by hand -- `moduleRegistry` can't
 * import this file back (lint:boundaries: core/module-registry may not depend on any
 * module), so the two stay hand-kept in sync rather than one importing the other.
 */
export const inventoryManifest: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  icon: "Package",
  routePrefix: "/inventory",
  nav: [
    {
      heading: "Overview",
      items: [
        { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
        { label: "Alerts", slug: "alerts", icon: "Bell" },
        { label: "Audit Log", slug: "audit-log", icon: "History" },
      ],
    },
    {
      heading: "Catalog & Inventory",
      items: [
        { label: "Products", slug: "products", icon: "Package" },
        { label: "Inventory", slug: "stock", icon: "RefreshCw" },
        { label: "Stock Transfers", slug: "transfers", icon: "Truck" },
        { label: "Warehouses", slug: "warehouses", icon: "Warehouse" },
      ],
    },
    {
      heading: "Sales",
      items: [
        { label: "Customers", slug: "customers", icon: "Users" },
        { label: "Sales Orders", slug: "sales-orders", icon: "ShoppingCart" },
        { label: "Sales Invoices", slug: "sales-invoices", icon: "FileText" },
        { label: "Sales Returns", slug: "sales-returns", icon: "RotateCcw" },
      ],
    },
    {
      heading: "Purchasing",
      items: [
        { label: "Suppliers", slug: "suppliers", icon: "Truck" },
        { label: "Purchase Orders", slug: "purchase-orders", icon: "ClipboardList" },
      ],
    },
    {
      heading: "Administration",
      items: [
        { label: "Team", slug: "team", icon: "Shield" },
        { label: "API Keys", slug: "api-keys", icon: "KeyRound" },
      ],
    },
  ],
  features: [
    "Product catalog and multi-warehouse stock",
    "Purchase orders and supplier management",
    "Sales orders, invoices, and returns",
    "Low-stock alerts and audit log",
  ],
  permissions: ["inventory.access"],
  optionalPeers: ["fsm", "gst"],
};
