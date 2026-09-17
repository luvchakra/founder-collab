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
      // No "Administration > Team" group: team and permissions are business-level, not
      // per-module, and that page lives at /[businessSlug]/admin/team. The entry left
      // behind here after that move pointed at /inventory/team, which has no page --
      // a dead link in the rail, and the one failing case in tests/menu-routes.test.ts.
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
    routePrefix: "/service",
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
          { label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" },
          { label: "Inbox", slug: "", icon: "Inbox" },
          { label: "Conversations", slug: "conversations", icon: "MessageCircle" },
          { label: "Potential Lost Business", slug: "lost-business", icon: "AlertTriangle" },
          { label: "Reviews", slug: "reviews", icon: "Star" },
        ],
      },
      {
        heading: "Sales",
        items: [
          { label: "Leads", slug: "leads", icon: "Users" },
          { label: "Sales Opportunities", slug: "opportunities", icon: "Target" },
          { label: "Follow-ups", slug: "follow-ups", icon: "ListTodo" },
          { label: "Exceptions", slug: "exceptions", icon: "ClipboardList" },
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
      "Potential Lost Business dashboard",
      "Google Business Profile review inbox",
    ],
    permissions: ["crm.access"],
    optionalPeers: ["discovery", "fsm", "inventory", "gst"],
  },
  {
    // Key/schema/routePrefix stay "gst" (CLAUDE.md non-negotiable #1: every
    // module-owned table lives in its own Postgres schema, "gst" among them --
    // renaming the key would mean renaming the schema, every license row's
    // module_key, and the route prefix, none of which this rename asked for).
    // Only the display `name` changes, to "Finance" -- same precedent as fsm's
    // key staying "fsm" while its name is "Service".
    // The module key, database schema and permission namespace all stay "gst" -- only
    // the display name and URL segment become "Finance"/"/finance", since existing
    // licenses, migrations, RLS policies and contracts are all keyed on "gst". The two
    // historical URL spellings (/gst, /compliance) redirect in proxy.ts.
    key: "gst",
    name: "Finance",
    icon: "Landmark",
    routePrefix: "/finance",
    // Finance's full navigation (accounting, reports, reconciliation) lands with the
    // pages themselves, phase by phase -- an entry here renders a real link in the rail,
    // so listing a page before it exists ships a 404 (and fails tests/menu-routes.test.ts,
    // which asserts every nav item resolves to a real page).
    nav: [
      { heading: "Overview", items: [{ label: "Dashboard", slug: "dashboard", icon: "LayoutDashboard" }] },
      {
        heading: "Accounting",
        items: [{ label: "Chart of Accounts", slug: "accounts", icon: "BookOpen" }],
      },
      {
        heading: "Tax & GST",
        items: [
          { label: "GST Profile", slug: "profile", icon: "Receipt" },
          { label: "GST Registrations", slug: "registrations", icon: "Building2" },
          { label: "GST Filing", slug: "filing", icon: "ClipboardList" },
          { label: "GSTR-2B Reconciliation", slug: "reconciliation", icon: "ListChecks" },
          { label: "e-Invoicing", slug: "einvoicing", icon: "FileText" },
          { label: "e-Way Bill", slug: "eway-bill", icon: "Truck" },
        ],
      },
      {
        // COMPLY-P0-11: Evidence (10.1) and Audit Log (10.3) are cross-cutting
        // record-keeping, not GST-return mechanics -- their own heading, matching how
        // "Overview" is already split out above.
        heading: "Records",
        items: [
          { label: "Evidence", slug: "evidence", icon: "FolderOpen" },
          { label: "Audit Log", slug: "audit-log", icon: "History" },
        ],
      },
    ],
    features: [
      "Accounting, ledger and financial reports",
      "GST profile and GSTIN management",
      "e-Way bill generation",
      "e-Invoicing",
      "GST return filing and reconciliation",
    ],
    permissions: ["gst.access"],
    optionalPeers: ["inventory", "fsm"],
  },
];

export function getModule(key: ModuleKey): ModuleManifest | undefined {
  return moduleRegistry.find((module) => module.key === key);
}
