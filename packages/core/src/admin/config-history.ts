import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { listPlatformPlans, restorePlanFromSnapshot } from "./platform-plans";
import { listFeatureFlags, restoreFeatureFlagFromSnapshot } from "./platform-feature-flags";
import { listAnnouncements, restoreAnnouncementFromSnapshot } from "./platform-announcements";
import { restoreSystemPoliciesFromSnapshot } from "./platform-system-policies";
import { listAiProviders } from "./platform-ai-providers";
import { listEmailTemplates } from "./platform-email-templates";
import { listIntegrationRegistry } from "./platform-integrations";
import { listModuleRegistry } from "./platform-modules";

/**
 * PLATFORM-P0-17.1/17.2/17.3 ("Configuration Versioning", docs/plan/09-PLATFORM-ADMIN-
 * PORTAL-BACKLOG.md §22). See this story's own dated entry in
 * docs/design/platform-admin-portal-audit.md for the full entity-ownership check and scope
 * reasoning. Summary of what this file is and isn't:
 *
 * **17.1 (Version Configuration)**: every `platform.*_events` audit table already built by
 * a prior story (PLATFORM-P0-07.2 onward) captures a real, append-only sequence of
 * before/after snapshots -- this file adds the missing "vN" label on top (version 1 = the
 * oldest recorded event, version N = the most recent) and a uniform read shape
 * (`ConfigVersionEntry`) across all eleven of them, purely by querying tables that already
 * exist. No new table for any of the ten pre-existing `*_events` tables. `platform.plans`
 * is the one exception -- see `platform-plans.ts`'s own updated docstring and this
 * migration's own header comment (`20260913470000_platform_plan_events.sql`) for why it
 * needed a brand-new `plan_events` table this story (it had zero change history before
 * this, and §22's own flagship example is literally "Plan Pro v3").
 *
 * **17.2 (Draft vs Published)**: deliberately NOT generalized to every table here.
 * `platform.plans.status` already has a real `draft`/`active`/`deprecated`/`archived`
 * lifecycle (PLATFORM-P0-04.7) and `platform.branding` already has a real Draft ->
 * Preview -> Publish workflow (PLATFORM-P0-03.5's own `draft_data` column) -- both already
 * satisfy 17.2's own ask for the two entities that have an actual "preview before it goes
 * live" concept. Retrofitting a draft/archived state onto a boolean on/off toggle
 * (`feature_flags`, `ai_feature_policies`) or a live singleton config row
 * (`system_policies`, `email_provider`, `ai_provider_routing`) would be a genuinely
 * speculative new field nothing in this doc or any consuming story asks for (CLAUDE.md
 * development principle #7) -- there is no "preview" surface for a rate limit or an AI
 * provider's own routing rule the way there is for a login page's branding.
 *
 * **17.3 (Rollback)**: "where technically safe" -- restore is wired for four resource
 * types this story (`plan`, `feature_flag`, `announcement`, `system_policies`), each by
 * re-invoking that entity's own already-audited `updateX()` function with a historical
 * `new_value` snapshot mapped back into its own update-schema input shape (see
 * `restorePlanFromSnapshot()`/`restoreFeatureFlagFromSnapshot()`/
 * `restoreAnnouncementFromSnapshot()`/`restoreSystemPoliciesFromSnapshot()` in their own
 * files) -- restoring is genuinely just another edit, so it inherits that function's own
 * validation and writes its own new audit event for free ("rollback itself must be
 * audited," satisfied without a separate mechanism). The remaining seven resource types
 * (`ai_provider`, `ai_provider_routing`, `ai_feature_policies`, `email_provider`,
 * `email_template`, `integration`, `module_status`) get the same read-only version list
 * (17.1) but no restore path yet -- each of their own update functions has a different
 * shape (several are 10+ positional-argument singletons, two use per-column
 * previous_status/new_status pairs instead of a JSONB snapshot at all) and wiring all
 * seven correctly in one sitting risks a subtly wrong restore for a real, live platform
 * config -- left as a mechanical, lower-risk follow-up once this same pattern is proven,
 * matching this backlog's own "done partially, rest deferred" precedent (e.g.
 * PLATFORM-P0-10.1/18.2/18.4).
 */

export type ConfigResourceType =
  | "plan"
  | "feature_flag"
  | "announcement"
  | "system_policies"
  | "ai_provider"
  | "ai_provider_routing"
  | "ai_feature_policies"
  | "email_provider"
  | "email_template"
  | "integration"
  | "module_status";

export type ConfigResourceOption = { id: string; label: string };

export type ConfigVersionEntry = {
  version: number;
  eventId: string;
  action: string;
  reason: string;
  performedBy: string | null;
  performedAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  isCurrent: boolean;
  /** The specific instance this event belongs to (the events table's own `idColumn`
   * value), or `null` for a singleton resource type. Added for PLATFORM-P0-16.3 ("Audit
   * Search") -- `null` when the resource type has no instance concept, never omitted, so
   * a caller merging events across every instance at once (`listConfigVersions(type,
   * null)`) can still tell which instance produced which row. */
  instanceId: string | null;
};

type RawEventRow = Record<string, unknown>;

type ResourceDef = {
  label: string;
  /** Whether this resource type has multiple named instances (a picker is needed) or is a
   * single, platform-wide row. */
  singleton: boolean;
  eventsTable: string;
  /** Column on the events table identifying which instance a row belongs to; `null` for a
   * singleton resource (there is only ever one history stream). */
  idColumn: string | null;
  listInstances?: () => Promise<ConfigResourceOption[]>;
  toSnapshot: (row: RawEventRow) => { action: string; before: RawEventRow | null; after: RawEventRow | null };
  /** Present only for the resource types 17.3 wires restore for this story. */
  restore?: (resourceId: string | null, snapshot: RawEventRow, reason: string) => Promise<{ ok: boolean; error?: string }>;
};

function jsonbPair(row: RawEventRow): { action: string; before: RawEventRow | null; after: RawEventRow | null } {
  return {
    action: String(row.action ?? "updated"),
    before: (row.previous_value as RawEventRow | null) ?? null,
    after: (row.new_value as RawEventRow | null) ?? null,
  };
}

async function idLabelFrom<T>(rows: T[], id: (r: T) => string, label: (r: T) => string): Promise<ConfigResourceOption[]> {
  return rows.map((r) => ({ id: id(r), label: label(r) }));
}

const RESOURCE_DEFS: Record<ConfigResourceType, ResourceDef> = {
  plan: {
    label: "Plans",
    singleton: false,
    eventsTable: "plan_events",
    idColumn: "plan_id",
    listInstances: async () => idLabelFrom(await listPlatformPlans(), (p) => p.id, (p) => `${p.name} (${p.key})`),
    toSnapshot: jsonbPair,
    restore: async (id, snapshot, reason) => {
      if (!id) return { ok: false, error: "No plan selected." };
      const result = await restorePlanFromSnapshot(id, snapshot, reason);
      return result.ok ? { ok: true } : { ok: false, error: "error" in result ? result.error : "Restore failed." };
    },
  },
  feature_flag: {
    label: "Feature Flags",
    singleton: false,
    eventsTable: "feature_flag_events",
    idColumn: "flag_id",
    listInstances: async () => idLabelFrom(await listFeatureFlags(), (f) => f.id, (f) => f.featureKey),
    toSnapshot: jsonbPair,
    restore: async (id, snapshot, reason) => {
      if (!id) return { ok: false, error: "No feature flag selected." };
      const result = await restoreFeatureFlagFromSnapshot(id, snapshot, reason);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  },
  announcement: {
    label: "Announcements",
    singleton: false,
    eventsTable: "announcement_events",
    idColumn: "announcement_id",
    listInstances: async () => idLabelFrom(await listAnnouncements(), (a) => a.id, (a) => a.title),
    toSnapshot: jsonbPair,
    restore: async (id, snapshot, reason) => {
      if (!id) return { ok: false, error: "No announcement selected." };
      const result = await restoreAnnouncementFromSnapshot(id, snapshot, reason);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  },
  system_policies: {
    label: "Platform Policies",
    singleton: true,
    eventsTable: "system_policy_events",
    idColumn: null,
    toSnapshot: jsonbPair,
    restore: async (_id, snapshot, reason) => {
      const result = await restoreSystemPoliciesFromSnapshot(snapshot, reason);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
  },
  ai_provider: {
    label: "AI Providers",
    singleton: false,
    eventsTable: "ai_provider_events",
    idColumn: "provider",
    listInstances: async () => idLabelFrom(await listAiProviders(), (p) => p.provider, (p) => p.provider),
    toSnapshot: jsonbPair,
  },
  ai_provider_routing: {
    label: "AI Routing",
    singleton: true,
    eventsTable: "ai_provider_routing_events",
    idColumn: null,
    toSnapshot: jsonbPair,
  },
  ai_feature_policies: {
    label: "AI Feature Policies",
    singleton: true,
    eventsTable: "ai_feature_policy_events",
    idColumn: null,
    toSnapshot: jsonbPair,
  },
  email_provider: {
    label: "Email Provider",
    singleton: true,
    eventsTable: "email_provider_events",
    idColumn: null,
    toSnapshot: jsonbPair,
  },
  email_template: {
    label: "Email Templates",
    singleton: false,
    eventsTable: "email_template_events",
    idColumn: "template_key",
    listInstances: async () => idLabelFrom(await listEmailTemplates(), (t) => t.templateKey, (t) => t.label),
    toSnapshot: jsonbPair,
  },
  integration: {
    label: "Integrations",
    singleton: false,
    eventsTable: "integration_status_events",
    idColumn: "integration_key",
    listInstances: async () =>
      idLabelFrom(await listIntegrationRegistry(), (i) => i.integrationKey, (i) => i.displayName),
    toSnapshot: (row) => ({
      action: "status_changed",
      before: { status: row.previous_status, notes: row.previous_notes },
      after: { status: row.new_status, notes: row.new_notes },
    }),
  },
  module_status: {
    label: "Module Status",
    singleton: false,
    eventsTable: "module_status_events",
    idColumn: "module_key",
    listInstances: async () => idLabelFrom(await listModuleRegistry(), (m) => m.moduleKey, (m) => m.moduleName),
    toSnapshot: (row) => ({
      action: "status_changed",
      before: { status: row.previous_status, message: row.previous_message },
      after: { status: row.new_status, message: row.new_message },
    }),
  },
};

/** For the config-history page's own "Configuration" dropdown. */
export const CONFIG_RESOURCE_TYPES: { key: ConfigResourceType; label: string; singleton: boolean; restorable: boolean }[] =
  (Object.keys(RESOURCE_DEFS) as ConfigResourceType[]).map((key) => ({
    key,
    label: RESOURCE_DEFS[key].label,
    singleton: RESOURCE_DEFS[key].singleton,
    restorable: Boolean(RESOURCE_DEFS[key].restore),
  }));

/** For a non-singleton resource type's own instance picker. Empty for a singleton type
 * (there is nothing to pick -- it has exactly one history stream). */
export async function listConfigResourceInstances(resourceType: ConfigResourceType): Promise<ConfigResourceOption[]> {
  await requireSuperadmin();
  const def = RESOURCE_DEFS[resourceType];
  if (!def.listInstances) return [];
  return def.listInstances();
}

/**
 * The full version history for one resource (or, for a singleton resource type, the one
 * history stream that exists). Oldest first, `version` 1-indexed so it reads the way §22's
 * own examples do ("Plan Pro v3" is the 3rd recorded event for that plan).
 */
export async function listConfigVersions(
  resourceType: ConfigResourceType,
  resourceId: string | null,
): Promise<ConfigVersionEntry[]> {
  await requireSuperadmin();
  const def = RESOURCE_DEFS[resourceType];
  const supabase = await createClient({ schema: "platform" });
  let query = supabase.from(def.eventsTable).select("*").order("performed_at", { ascending: true });
  if (def.idColumn && resourceId) query = query.eq(def.idColumn, resourceId);
  const { data, error } = await query;
  if (error) throw error;

  const rows = data as RawEventRow[];
  return rows.map((row, index) => {
    const snap = def.toSnapshot(row);
    return {
      version: index + 1,
      eventId: row.id as string,
      action: snap.action,
      reason: String(row.reason ?? ""),
      performedBy: (row.performed_by as string | null) ?? null,
      performedAt: row.performed_at as string,
      before: snap.before,
      after: snap.after,
      isCurrent: index === rows.length - 1,
      instanceId: def.idColumn ? String(row[def.idColumn] ?? "") : null,
    };
  });
}

/**
 * PLATFORM-P0-17.3: restores a resource to a given historical version's own resulting
 * state (`after`). Only defined for the four resource types listed in this file's own
 * top-of-file docstring -- every other resource type returns a clear, typed refusal
 * instead of silently doing nothing.
 */
export async function restoreConfigVersion(
  resourceType: ConfigResourceType,
  resourceId: string | null,
  eventId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const def = RESOURCE_DEFS[resourceType];
  if (!def.restore) {
    return { ok: false, error: "Restore isn't available for this configuration yet -- it's read-only history for now." };
  }
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "A reason is required to restore a previous version." };
  }

  const versions = await listConfigVersions(resourceType, resourceId);
  const target = versions.find((v) => v.eventId === eventId);
  if (!target) return { ok: false, error: "That version could not be found." };
  if (!target.after) {
    return { ok: false, error: "This version has no recorded state to restore (it records a deletion)." };
  }
  if (target.isCurrent) {
    return { ok: false, error: "This is already the current version." };
  }

  const result = await def.restore(resourceId, target.after, reason.trim());
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Restore failed." };
}

// Re-exported for server-side callers so this stays one logical module -- see
// `config-history-diff.ts`'s own docstring for why a Client Component must import that
// file directly instead of through here.
export { diffSnapshotFields, type SnapshotFieldDiff } from "./config-history-diff";
