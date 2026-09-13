import {
  CONFIG_RESOURCE_TYPES,
  listConfigResourceInstances,
  listConfigVersions,
} from "@cofounderai/core/admin/config-history";
import { PlatformImpactBanner } from "../../impact-banner";
import { ConfigHistoryExplorer } from "./config-history-explorer";

/**
 * PLATFORM-P0-17.1/17.2/17.3 ("Configuration Versioning", docs/plan/09-PLATFORM-ADMIN-
 * PORTAL-BACKLOG.md §22). See `packages/core/src/admin/config-history.ts`'s own
 * top-of-file docstring for the full scope reasoning: why this is a read-side feature on
 * top of every already-existing `platform.*_events` audit table (plus one new table,
 * `platform.plan_events`, for Plans specifically), why 17.2 (Draft vs Published) isn't
 * generalized to new tables here, and why 17.3 (Rollback) is wired for four resource types
 * this story with the rest deferred.
 *
 * One generic explorer page rather than a "History" action bolted onto eleven different
 * existing admin pages -- the read/restore mechanism is uniform across every resource
 * type, so one page reusing it is simpler than eleven near-duplicate wire-ups
 * (CLAUDE.md development principle #1).
 *
 * The initial resource type's instances/versions are loaded here, server-side, and handed
 * to the client explorer as starting state -- every *subsequent* selection change is
 * fetched from an explicit `onChange` handler via a server action (see
 * `config-history-explorer.tsx`), never from a bare `useEffect`, matching
 * `plan-dialog.tsx`'s own documented reason for avoiding that shape (the
 * `react-hooks/set-state-in-effect` lint rule).
 */
export default async function PlatformConfigHistoryPage() {
  const first = CONFIG_RESOURCE_TYPES[0];
  const initialInstances = first.singleton ? [] : await listConfigResourceInstances(first.key);
  const initialInstanceId = first.singleton ? null : (initialInstances[0]?.id ?? null);
  const initialVersions = first.singleton || initialInstanceId ? await listConfigVersions(first.key, initialInstanceId) : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Configuration History</h1>
        <p className="text-sm text-zinc-400">
          Every recorded version of an audited platform configuration, oldest first. Restore is available for Plans,
          Feature Flags, Announcements, and Platform Policies; every other configuration below is history-only for now.
        </p>
      </div>
      <PlatformImpactBanner description="Restoring a prior version replaces the live configuration for every business using it right now." />
      <ConfigHistoryExplorer
        resourceTypes={CONFIG_RESOURCE_TYPES}
        initialResourceType={first.key}
        initialInstances={initialInstances}
        initialInstanceId={initialInstanceId}
        initialVersions={initialVersions}
      />
    </div>
  );
}
