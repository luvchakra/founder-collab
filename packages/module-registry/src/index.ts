/**
 * Static manifest of the platform's licensable modules (story `P-3`,
 * docs/plan/04-CLAUDE-CODE-BACKLOG.md). `apps/web` builds navigation, routes and
 * dashboards from this registry — never from a hardcoded list (00-MASTER-PLAN.md §6).
 *
 * Each module's own package will eventually own its manifest entry (once
 * `packages/module-<key>` exists, per stories P-5/SP-7/F-1/S-1/S-2); until then the
 * five entries are declared here directly.
 */

export type ModuleKey = "discovery" | "inventory" | "fsm" | "crm" | "gst";

export interface ModuleNavItem {
  label: string;
  /** Route segment under the module's own `routePrefix`; "" means the module's root
   * route itself (e.g. fsm's own dashboard at `/fsm`, no extra segment). */
  slug: string;
  /** lucide-react icon name; resolved to a component where it's rendered, not here. */
  icon: string;
}

export interface ModuleNavGroup {
  /** Section heading shown above `items`; omitted for a flat list with no heading
   * (e.g. GST's nav, which has no grouped sections). */
  heading?: string;
  items: ModuleNavItem[];
}

export interface ModuleManifest {
  key: ModuleKey;
  name: string;
  /** lucide-react icon name; resolved to a component where it's rendered, not here. */
  icon: string;
  /** Route segment under apps/web/app/(dashboard)/[businessSlug]/, e.g. "/discovery". */
  routePrefix: string;
  nav: ModuleNavGroup[];
  /** Short, plain-language bullets of what a license for this module actually includes --
   * shown on the licenses settings page so a founder can see what they're buying/keeping
   * without having to click into the module itself. Not exhaustive, not derived from
   * `nav` (nav is a route tree for the sidebar; this is marketing-level, few enough
   * items to read at a glance). */
  features: string[];
  /** Permission keys this module defines, seeded into core.permissions by story C-7. */
  permissions: string[];
  /** Other module keys this module integrates with when both are licensed (soft, per ADR-10). */
  optionalPeers: ModuleKey[];
}

export const moduleRegistry: ModuleManifest[] = [
  {
    key: "discovery",
    name: "Discovery",
    icon: "Target",
    routePrefix: "/discovery",
    // Discovery's real sidebar content is its own business's product list, rendered
    // directly from live data (packages/core/src/components/shell/app-sidebar.tsx),
    // not a static nav tree -- this entry exists only so every module has *a* nav
    // manifest for the shape's other consumers (usage/licenses pages).
    nav: [{ heading: undefined, items: [{ label: "Overview", slug: "", icon: "Target" }] }],
    features: [
      "AI-generated ideal customer profiles",
      "Prospect discovery and research",
      "CSV/Excel/PDF prospect and catalog import",
      "Outreach conversion tracking",
    ],
    permissions: ["discovery.access"],
    optionalPeers: ["fsm"],
  },
  {
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
        items: [{ label: "Team", slug: "team", icon: "Shield" }],
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
  },
  {
    key: "fsm",
    name: "Service",
    icon: "Wrench",
    routePrefix: "/fsm",
    nav: [
      { heading: "Overview", items: [{ label: "Dashboard", slug: "", icon: "LayoutDashboard" }] },
      {
        heading: "Pipeline",
        items: [
          { label: "Opportunities", slug: "opportunities", icon: "Target" },
          { label: "Jobs", slug: "jobs", icon: "Briefcase" },
        ],
      },
      {
        heading: "Scheduling",
        items: [
          { label: "Schedule", slug: "schedule", icon: "CalendarDays" },
          { label: "My Day", slug: "my-day", icon: "Smartphone" },
        ],
      },
      { heading: "Billing", items: [{ label: "Invoices", slug: "invoices", icon: "FileText" }] },
      { heading: "Customers", items: [{ label: "Customers", slug: "customers", icon: "Users" }] },
      { heading: "Reports", items: [{ label: "Reports", slug: "reports", icon: "BarChart3" }] },
      { heading: "Administration", items: [{ label: "Settings", slug: "settings", icon: "Settings" }] },
    ],
    features: [
      "Opportunity-to-job pipeline",
      "Crew scheduling and dispatch calendar",
      "Mobile-friendly field work (time, notes, signatures)",
      "Job invoicing and reporting",
    ],
    permissions: ["fsm.access"],
    optionalPeers: ["discovery", "inventory", "gst", "crm"],
  },
  {
    key: "crm",
    name: "CRM",
    icon: "Inbox",
    routePrefix: "/crm",
    nav: [
      {
        heading: "Overview",
        items: [
          { label: "Inbox", slug: "", icon: "Inbox" },
          { label: "Conversations", slug: "conversations", icon: "MessageCircle" },
          { label: "Potential Lost Business", slug: "lost-business", icon: "AlertTriangle" },
        ],
      },
      {
        heading: "Sales",
        items: [
          { label: "Leads", slug: "leads", icon: "Users" },
          { label: "Opportunities", slug: "opportunities", icon: "Target" },
          { label: "Follow-ups", slug: "follow-ups", icon: "ListTodo" },
        ],
      },
      {
        heading: "Administration",
        items: [
          { label: "Channels", slug: "channels", icon: "Radio" },
          { label: "WhatsApp", slug: "whatsapp", icon: "MessageCircle" },
          { label: "Routing Rules", slug: "routing-rules", icon: "Route" },
        ],
      },
    ],
    features: [
      "Unified inbox across channels",
      "Channel connections",
      "Automated routing rules",
      "Lead lifecycle tracking",
      "Opportunity pipeline",
      "Follow-up queue",
      "Conversation-based unified inbox",
      "WhatsApp Business integration",
      "Potential Lost Business queue",
    ],
    permissions: ["crm.access"],
    optionalPeers: ["discovery", "fsm", "inventory", "gst"],
  },
  {
    // Key/schema/routePrefix stay "gst" (CLAUDE.md non-negotiable #1: every
    // module-owned table lives in its own Postgres schema, "gst" among them --
    // renaming the key would mean renaming the schema, every license row's
    // module_key, and the route prefix, none of which this rename asked for).
    // Only the display `name` changes, to "Compliance" -- same precedent as fsm's
    // key staying "fsm" while its name is "Service".
    key: "gst",
    name: "Compliance",
    icon: "Receipt",
    routePrefix: "/gst",
    nav: [
      { heading: "Overview", items: [{ label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" }] },
      {
        heading: "GST",
        items: [
          { label: "GST Profile", slug: "profile", icon: "Receipt" },
          { label: "e-Way Bill", slug: "eway-bill", icon: "Truck" },
          { label: "e-Invoicing", slug: "einvoicing", icon: "FileText" },
          { label: "GST Filing", slug: "filing", icon: "ClipboardList" },
        ],
      },
    ],
    features: ["GST profile and GSTIN management", "e-Way bill generation", "e-Invoicing", "GST return filing"],
    permissions: ["gst.access"],
    optionalPeers: ["inventory", "fsm"],
  },
];

export function getModule(key: ModuleKey): ModuleManifest | undefined {
  return moduleRegistry.find((module) => module.key === key);
}
