import { listAuditLogActors, searchPlatformAuditLog } from "@cofounderai/core/admin/platform-audit-log";
import { AuditSearchExplorer } from "./audit-search-explorer";

/**
 * PLATFORM-P0-16.1/16.2/16.3 ("Platform Audit", docs/plan/09-PLATFORM-ADMIN-BACKLOG.md
 * §20). See `packages/core/src/admin/platform-audit-log.ts`'s own top-of-file docstring
 * for the full scope reasoning (how this differs from and reuses Configuration History,
 * which mutations are newly covered, severity classification, and what's deliberately not
 * built this story).
 *
 * 16.4 ("Configuration History") needs no new page here -- it's already
 * `/platform/config-history` (PLATFORM-P0-17); this page links to it rather than
 * duplicating it.
 */
export default async function PlatformAuditPage() {
  const [actors, initialEntries] = await Promise.all([listAuditLogActors(), searchPlatformAuditLog({})]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Platform Audit</h1>
        <p className="text-sm text-zinc-400">
          Every recorded platform mutation, newest first -- who did what, to which resource, and why. High-severity
          rows cover 16.2&apos;s own mandatory categories: plan changes, entitlements, module/feature kill switches, AI
          provider keys, security policy and data retention changes, integrations, compliance rules, and maintenance-
          mode announcements. For a single configuration&apos;s own version-by-version history (with rollback where
          available), see{" "}
          <a href="/platform/config-history" className="underline hover:text-zinc-200">
            Configuration History
          </a>
          .
        </p>
      </div>
      <AuditSearchExplorer actors={actors} initialEntries={initialEntries} />
    </div>
  );
}
