/**
 * PLATFORM-P0-04.5/04.6: the 13 resource dimensions the doc names, split into their own
 * file with no server-only imports (no `../db/server`, no `../rbac/platform-admin`) --
 * `platform-plan-limits.ts` re-exports these for server-side callers, but a Client
 * Component (e.g. `quantity-limits-section.tsx`) needs to render `RESOURCE_LABELS`
 * directly, and importing any runtime value from `platform-plan-limits.ts` itself would
 * pull `../db/server` (which uses `next/headers`) into the client bundle -- the exact
 * failure `next build` caught here. Type-only imports (`import type`) are erased at
 * compile time and don't have this problem; only runtime value imports do.
 */
export const RESOURCE_KEYS = [
  "businesses",
  "users",
  "business_offerings",
  "products",
  "contacts",
  "prospects",
  "opportunities",
  "ai_runs",
  "ai_credits",
  "whatsapp_conversations",
  "storage",
  "api_calls",
  "automation_runs",
] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/** Plain-language labels for the admin UI -- the doc's own §8.5 wording ("business
 * offerings", not "businessOfferings"), not derived mechanically from the slug. */
export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  businesses: "Businesses",
  users: "Users",
  business_offerings: "Business offerings",
  products: "Products",
  contacts: "Contacts",
  prospects: "Prospects",
  opportunities: "Opportunities",
  ai_runs: "AI runs",
  ai_credits: "AI credits",
  whatsapp_conversations: "WhatsApp conversations",
  storage: "Storage",
  api_calls: "API calls",
  automation_runs: "Automation runs",
};
