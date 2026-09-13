/**
 * PLATFORM-P0-17.1 ("Configuration Versioning", §22): `diffSnapshotFields()` split out of
 * `config-history.ts` into its own file with no server-only imports. `config-history.ts`
 * itself imports `../db/server` (which pulls in `next/headers`) at module scope for its
 * data-loading functions -- fine for a Server Component or a Server Action, but importing
 * ANY export from that file, even a pure one, from a Client Component drags the whole
 * module graph (and `next/headers`) into the client bundle and fails the build ("You're
 * importing a module that depends on next/headers... in the Pages Router" -- Turbopack's
 * actual error the first time this was tried). `config-history-explorer.tsx` (a Client
 * Component, for its interactive version list/diff/restore UI) imports this file directly
 * instead; `config-history.ts` re-exports it so server-side callers see one module.
 */

export type SnapshotFieldDiff = { field: string; before: unknown; after: unknown };

const IGNORED_SNAPSHOT_FIELDS = new Set(["updated_at", "updated_by", "created_at"]);

/**
 * Pure, unit-testable diff between two version snapshots (CLAUDE.md development principle
 * #9) -- which fields actually changed between `before` and `after`, for the history
 * viewer's own expanded-row detail. `updated_at`/`updated_by`/`created_at` are excluded:
 * they change on every single edit by definition and would drown out the fields a
 * superadmin actually wants to compare.
 */
export function diffSnapshotFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): SnapshotFieldDiff[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diffs: SnapshotFieldDiff[] = [];
  for (const field of keys) {
    if (IGNORED_SNAPSHOT_FIELDS.has(field)) continue;
    const b = before ? before[field] : undefined;
    const a = after ? after[field] : undefined;
    if (JSON.stringify(b) !== JSON.stringify(a)) diffs.push({ field, before: b ?? null, after: a ?? null });
  }
  return diffs;
}
