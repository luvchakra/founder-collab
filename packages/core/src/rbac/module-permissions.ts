/**
 * RBAC-20 / RBAC-30 -- the permission that opens each licensable module (§30). Mirrors
 * core.module_view_permission() in the database; kept dependency-free so the route guard
 * (db/middleware.ts) can use it without pulling server-component code into the proxy.
 */
export const MODULE_VIEW_PERMISSION: Record<string, string> = {
  discovery: "discovery.view",
  inventory: "inventory.view",
  fsm: "service.view",
  crm: "crm.view",
  gst: "finance.view",
};
