import { createAdminClient } from "../db/admin";
import { requireSuperadmin } from "../rbac/platform-admin";
import type { ModuleKey } from "../licensing/types";
import type { AiProvider } from "../ai-providers/types";

/**
 * PLATFORM-P0-09.5 ("AI Usage", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13) --
 * a read-only, platform-wide tracking view over AI runs, built entirely from the two
 * usage ledgers this codebase already owns (CLAUDE.md non-negotiable #5: use the
 * canonical table, do not create a parallel one):
 *
 *   - `core.ai_runs` (`business_id`-scoped, Epic 6 story S-4) -- today written to only by
 *     `module-crm` (four operations: `summarize_customer`, `summarize_conversation`,
 *     `check_response_quality`, `draft_review_response`), by design the shared home for
 *     any future non-discovery module's own AI usage too.
 *   - `discovery.ai_runs` (`workspace_id`-scoped, ADR-4's own workspace tenancy for
 *     discovery) -- every one of discovery's own operations, still separate per that
 *     table's own migration ("discovery keeps billing through its own existing path,
 *     completely untouched").
 *
 * **No new table, no new migration**: this is a pure read aggregation across two already-
 * RLS-tested tables via the service-role admin client (same pattern
 * `platform-dashboard-queries.ts` already established for cross-tenant superadmin reads),
 * gated by `requireSuperadmin()` -- there is no new access pattern for a dedicated
 * `scripts/test-platform-*-rls.mjs` to prove, since neither underlying table's own RLS
 * changes and this file never writes anything.
 *
 * **"module" is a best-effort label derived from `operation`, not a stored column** --
 * neither `core.ai_runs` nor `discovery.ai_runs` records which module logged a run.
 * `discovery.ai_runs` rows are always `module: "discovery"` (that table has no other
 * writer). `core.ai_runs` rows are labelled via `CORE_AI_RUN_OPERATION_MODULE`, a small,
 * explicit map built from grepping every current caller of `recordAiRun()` outside
 * `module-discovery` -- today, only `module-crm`'s own four operations. An operation not
 * in that map (a future module's own new operation, until this map is updated alongside
 * it) shows `module: null` rather than a guessed label -- the run's own real `operation`
 * string is still returned so nothing is hidden. Retrofitting a real `module_key` column
 * onto `core.ai_runs` (and updating every module's own `recordAiRun()` call site to pass
 * it) would be a cross-cutting change to shared infrastructure and to other workstreams'
 * own module packages -- out of this workstream's scope (this run's own task brief:
 * "Do not touch module-discovery... or any other workstream's files") and unnecessary for
 * a "track" story with no enforcement of its own.
 *
 * **"business" for a discovery run is resolved via the real, existing
 * `discovery.ai_runs.workspace_id -> discovery.workspaces.product_id ->
 * discovery.products.business_id` chain** -- not `discovery.ai_runs.account_id` alone,
 * which is account-grained and an account can own more than one business.
 *
 * **Never exposes secret credentials** (§13's own explicit instruction for this story) --
 * neither `core.ai_provider_credentials`/`discovery.ai_provider_credentials` nor
 * `platform.ai_provider_keys` is read anywhere in this file.
 */

export type AiUsageRun = {
  id: string;
  source: "core" | "discovery";
  provider: AiProvider | string | null;
  model: string;
  operation: string;
  /** null when `operation` isn't in the known map -- see this file's own top docstring. */
  module: ModuleKey | "discovery" | null;
  businessId: string | null;
  businessName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  status: "succeeded" | "failed";
  createdAt: string;
};

/** Every current caller of `recordAiRun()` (`packages/core/src/ai-usage/mutations.ts`)
 * from outside `module-discovery`, as of this story -- see this file's own top docstring. */
export const CORE_AI_RUN_OPERATION_MODULE: Record<string, ModuleKey> = {
  summarize_customer: "crm",
  summarize_conversation: "crm",
  check_response_quality: "crm",
  draft_review_response: "crm",
};

type CoreAiRunRow = {
  id: string;
  business_id: string;
  operation: string;
  model: string;
  provider: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | string | null;
  status: "succeeded" | "failed";
  created_at: string;
};

type DiscoveryAiRunRow = {
  id: string;
  workspace_id: string;
  operation: string;
  model: string;
  provider: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | string | null;
  status: "succeeded" | "failed";
  created_at: string;
};

function toNumberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

/** The most recent AI runs across the whole platform, newest first -- merged from both
 * ledgers described in this file's own top docstring. `limit` bounds each source's own
 * fetch before merging (so the true combined result can be up to `2 * limit` rows,
 * trimmed back down to `limit` after the merge-sort) rather than risking one very active
 * source starving the other out of a single combined query. */
export async function listAiUsage(limit = 100): Promise<AiUsageRun[]> {
  await requireSuperadmin();

  const coreClient = createAdminClient({ schema: "core" });
  const discoveryClient = createAdminClient({ schema: "discovery" });

  const [coreRunsResult, discoveryRunsResult] = await Promise.all([
    coreClient
      .from("ai_runs")
      .select("id, business_id, operation, model, provider, input_tokens, output_tokens, estimated_cost, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
    discoveryClient
      .from("ai_runs")
      .select("id, workspace_id, operation, model, provider, input_tokens, output_tokens, estimated_cost, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (coreRunsResult.error) throw coreRunsResult.error;
  if (discoveryRunsResult.error) throw discoveryRunsResult.error;

  const coreRuns = coreRunsResult.data as CoreAiRunRow[];
  const discoveryRuns = discoveryRunsResult.data as DiscoveryAiRunRow[];

  const [coreBusinessNames, discoveryBusinessByWorkspace] = await Promise.all([
    resolveCoreBusinessNames(coreClient, coreRuns.map((r) => r.business_id)),
    resolveDiscoveryBusinesses(coreClient, discoveryClient, discoveryRuns.map((r) => r.workspace_id)),
  ]);

  const mergedCoreRuns: AiUsageRun[] = coreRuns.map((row) => ({
    id: row.id,
    source: "core",
    provider: row.provider,
    model: row.model,
    operation: row.operation,
    module: CORE_AI_RUN_OPERATION_MODULE[row.operation] ?? null,
    businessId: row.business_id,
    businessName: coreBusinessNames.get(row.business_id) ?? null,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCost: toNumberOrNull(row.estimated_cost),
    status: row.status,
    createdAt: row.created_at,
  }));

  const mergedDiscoveryRuns: AiUsageRun[] = discoveryRuns.map((row) => {
    const business = discoveryBusinessByWorkspace.get(row.workspace_id) ?? null;
    return {
      id: row.id,
      source: "discovery",
      provider: row.provider,
      model: row.model,
      operation: row.operation,
      module: "discovery",
      businessId: business?.id ?? null,
      businessName: business?.name ?? null,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      estimatedCost: toNumberOrNull(row.estimated_cost),
      status: row.status,
      createdAt: row.created_at,
    };
  });

  return [...mergedCoreRuns, ...mergedDiscoveryRuns]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

async function resolveCoreBusinessNames(
  coreClient: ReturnType<typeof createAdminClient>,
  businessIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(businessIds));
  if (uniqueIds.length === 0) return new Map();
  const { data, error } = await coreClient.from("businesses").select("id, name").in("id", uniqueIds);
  if (error) throw error;
  return new Map((data as { id: string; name: string }[]).map((b) => [b.id, b.name]));
}

/** Resolves each distinct `discovery.ai_runs.workspace_id` to its owning business via the
 * real `workspace -> product -> business` chain -- see this file's own top docstring for
 * why `discovery.ai_runs.account_id` alone isn't precise enough. */
async function resolveDiscoveryBusinesses(
  coreClient: ReturnType<typeof createAdminClient>,
  discoveryClient: ReturnType<typeof createAdminClient>,
  workspaceIds: string[],
): Promise<Map<string, { id: string; name: string }>> {
  const uniqueWorkspaceIds = Array.from(new Set(workspaceIds));
  if (uniqueWorkspaceIds.length === 0) return new Map();

  const { data: workspaces, error: workspacesError } = await discoveryClient
    .from("workspaces")
    .select("id, product_id")
    .in("id", uniqueWorkspaceIds);
  if (workspacesError) throw workspacesError;
  const productIdByWorkspace = new Map(
    (workspaces as { id: string; product_id: string }[]).map((w) => [w.id, w.product_id]),
  );

  const uniqueProductIds = Array.from(new Set(productIdByWorkspace.values()));
  if (uniqueProductIds.length === 0) return new Map();
  const { data: products, error: productsError } = await discoveryClient
    .from("products")
    .select("id, business_id")
    .in("id", uniqueProductIds);
  if (productsError) throw productsError;
  const businessIdByProduct = new Map((products as { id: string; business_id: string }[]).map((p) => [p.id, p.business_id]));

  const uniqueBusinessIds = Array.from(new Set(businessIdByProduct.values()));
  if (uniqueBusinessIds.length === 0) return new Map();
  const { data: businesses, error: businessesError } = await coreClient
    .from("businesses")
    .select("id, name")
    .in("id", uniqueBusinessIds);
  if (businessesError) throw businessesError;
  const businessById = new Map((businesses as { id: string; name: string }[]).map((b) => [b.id, b]));

  const result = new Map<string, { id: string; name: string }>();
  for (const workspaceId of uniqueWorkspaceIds) {
    const productId = productIdByWorkspace.get(workspaceId);
    const businessId = productId ? businessIdByProduct.get(productId) : undefined;
    const business = businessId ? businessById.get(businessId) : undefined;
    if (business) result.set(workspaceId, business);
  }
  return result;
}
