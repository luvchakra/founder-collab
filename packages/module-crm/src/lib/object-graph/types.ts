/**
 * INT-08.1's "Linked Object Graph" -- a consolidated, typed list of every concrete
 * record linked to one CRM opportunity across all four modules, distinct from the
 * Journey model (INT-01.1) it's built from: Journey answers "what state is each
 * module's engagement in" (plain, unclickable status badges -- "Discovery ✓"); this
 * answers "which specific records exist and where do I go to open them." Today those
 * six reads (Journey, FSM quote status, fulfillment status, assessment status, linked
 * products) are scattered across the opportunity page's own data-fetching with no
 * single structure tying them together -- this is that structure.
 */
export type ObjectGraphModule = "discovery" | "crm" | "inventory" | "fsm";

export type ObjectGraphNode = {
  /** Stable per (module, entityType, entityId). */
  id: string;
  module: ObjectGraphModule;
  entityType: string;
  label: string;
  /** Null when no per-entity page exists to link to (e.g. a Discovery prospect or a
   * CRM lead, neither of which has a detail route in this codebase today) -- the node
   * still carries real information, it's just not clickable, same convention
   * `timeline/queries.ts`'s own prospect entry already established (`detailHref: null`)
   * rather than guessing at a URL that doesn't exist. */
  href: string | null;
};

export type LinkedObjectGraph = {
  opportunityId: string;
  nodes: ObjectGraphNode[];
};
